'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { formatUnits, parseUnits, type Address } from 'viem';

import { FAUCETS, IS_TESTNET, NATIVE_SYMBOL, NETWORK_LABEL, PAYMENT_VALUE_NOTE, chainLabel } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/wallet/notifications';
import { markSavedAgentAlertsRead, toggleSavedAgent } from '@/lib/wallet/saved-agents';
import { sendFromPasskey } from '@/lib/wallet/send';
import { describeSendProblem, parseAmount, sendableNative, type SendableToken } from '@/lib/wallet/send-rules';
import { usePasskeySigner } from '@/lib/wallet/PasskeyProvider';
import { useActiveWallet } from '@/lib/wallet/active';
import { useWalletState } from '@/shell/wallet/useWalletState';
import { AgentAvatar } from '@/ui/Agent';
import { Button, LinkButton } from '@/ui/Button';
import { TabLinks, Segmented } from '@/ui/Controls';
import { Address as AddressView, TxLink } from '@/ui/Data';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Field, Input } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { EmailLinkNotice } from './EmailLinkNotice';
import { jobPhase, PHASE, useInbox, useMyJobs, useNow, useSavedAgents, useSavedAlerts, type JobPhase } from './hooks';
import { useRequestAlerts } from '@/features/briefs/useRequestAlerts';
import { markRequestAlertRead, markRequestAlertsRead } from '@/lib/briefs/request-alerts';
import { budgetOf, JobRow, NeedsWallet, PageHeader, PhaseLabel } from './parts';
import { totalLines } from './totals';
import { MoneyTotal } from '@/ui/MoneyTotal';
import { approxTotalView } from '@/lib/money/approx-total';
import { RecoverJob } from './RecoverJob';
import { useReadSync } from './useReadSync';
import { jobHref } from '@/lib/jobs/href';

/* ───────────────────────── Jobs ───────────────────────── */

/*
 * Status filters live inside My jobs rather than in the sidebar. The ids
 * `attention`, `active` and `done` are linked from the overview and keep
 * their meaning. "Not funded" appears only when a job is in that state:
 * a filter that can only ever be empty is noise.
 */
const FILTERS: Array<{ id: string; label: string; phases: JobPhase[] | null; onlyIfAny?: boolean }> = [
  { id: 'all', label: 'All', phases: null },
  { id: 'attention', label: 'Needs you', phases: ['review', 'reclaim'] },
  { id: 'active', label: 'Running', phases: ['working'] },
  { id: 'review', label: 'Ready to review', phases: ['review'] },
  { id: 'disputed', label: 'Disputed', phases: ['disputed', 'rejected'] },
  { id: 'done', label: 'Completed', phases: ['settled'] },
  { id: 'refunds', label: 'Refunds', phases: ['refunded', 'expired'] },
  { id: 'unfunded', label: 'Not funded', phases: ['unfunded'], onlyIfAny: true },
];

export function JobsPage() {
  const { jobs, address, ready, failed, retry } = useMyJobs();
  const sp = useSearchParams();
  const filter = FILTERS.find((f) => f.id === sp.get('filter')) ?? FILTERS[0];
  const now = useNow();
  if (!address) {
    return (
      <>
        <PageHeader title="My jobs" />
        <NeedsWallet what="your jobs" />
      </>
    );
  }
  const agent = sp.get('agent');
  const scoped = agent ? jobs.filter((j) => `${j.agentChainId}:${j.agentTokenId}` === agent) : jobs;
  const counted = FILTERS.map((f) => ({ ...f, count: f.phases ? scoped.filter((j) => f.phases!.includes(jobPhase(j, now))).length : scoped.length }));
  const shown = filter.phases ? scoped.filter((j) => filter.phases!.includes(jobPhase(j, now))) : scoped;
  return (
    <>
      <PageHeader
        title="My jobs"
        description="Every job this wallet has funded through Pokter, from Pokter’s record of the wallet and from this browser, refreshed from chain when you open one."
        action={
          <div className="flex items-center gap-2">
            <LinkButton href="/workspace/agents" intent="ghost" size="s">
              By agent
            </LinkButton>
            <RecoverJob compact />
          </div>
        }
      />
      {agent && scoped[0] && (
        <p className="mb-3 text-sm text-ink-2">
          Showing jobs for <strong className="font-medium text-ink">{scoped[0].agentName}</strong> ·{' '}
          <Link href="/workspace/jobs" className="link">
            all agents
          </Link>
        </p>
      )}
      <TabLinks label="Filter jobs" active={filter.id} tabs={counted.filter((f) => !f.onlyIfAny || f.count > 0 || f.id === filter.id).map((f) => ({ id: f.id, label: f.label, href: f.id === 'all' ? '/workspace/jobs' : `/workspace/jobs?filter=${f.id}`, count: f.count }))} className="mb-2" />
      {failed && jobs.length > 0 && (
        <Notice tone="watch" title="Some jobs may be missing" className="mb-3" action={<Button size="s" intent="secondary" onClick={retry}>Try again</Button>}>
          Pokter&rsquo;s record of this wallet could not be read just now, so only the jobs this browser remembers are shown.
        </Notice>
      )}
      {!ready ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading your jobs">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[12px] bg-sunken motion-reduce:animate-none" />
          ))}
        </div>
      ) : failed && jobs.length === 0 ? (
        <EmptyState tone="bad" title="Your jobs could not be loaded" className="mt-6" action={<Button intent="secondary" onClick={retry}>Try again</Button>}>
          Pokter&rsquo;s record of this wallet did not answer just now. This only affects the list: your jobs, and any money in them, are unchanged in escrow. You can also recover a job by its number.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title={jobs.length === 0 ? 'No jobs yet' : 'Nothing here'} className="mt-6" action={jobs.length === 0 ? <LinkButton href="/discover">Find an agent</LinkButton> : undefined}>
          {jobs.length === 0 ? 'Hire an agent and its job appears here, with its deadline, delivery and settlement.' : 'No job is in this state right now.'}
        </EmptyState>
      ) : (
        <div className="ruled">
          {shown.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Hired agents ───────────────────────── */

export function HiredAgentsPage() {
  const { jobs, address } = useMyJobs();
  if (!address) {
    return (
      <>
        <PageHeader title="Hired agents" />
        <NeedsWallet what="the agents you have hired" />
      </>
    );
  }
  const byAgent = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const key = `${job.agentChainId}:${job.agentTokenId}`;
    byAgent.set(key, [...(byAgent.get(key) ?? []), job]);
  }
  const agents = Array.from(byAgent.entries());
  return (
    <>
      <PageHeader title="Hired agents" description="Each agent you have funded a job for, with what it is doing now and how its past jobs ended." />
      {agents.length === 0 ? (
        <EmptyState title="No agents hired yet" action={<LinkButton href="/discover">Find an agent</LinkButton>}>
          When you fund a job, the agent appears here with its history.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {agents.map(([key, list]) => {
            const latest = list[0];
            const active = list.find((j) => ['working', 'review', 'reclaim'].includes(jobPhase(j)));
            const settled = list.filter((j) => jobPhase(j) === 'settled').length;
            return (
              <li key={key} className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5">
                <div className="flex items-center gap-3">
                  <AgentAvatar name={latest.agentName} seed={key} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{latest.agentName}</p>
                    <p className="text-[12.5px] text-ink-3">
                      {list.length} job{list.length === 1 ? '' : 's'} · {settled} settled
                    </p>
                  </div>
                </div>
                <div className="rounded-[10px] bg-sunken/70 px-3 py-2.5 text-[13px]">
                  {active ? (
                    <Link href={jobHref(active)} className="flex items-center justify-between gap-2">
                      <span className="flex flex-col">
                        <span className="text-ink-3">Current job #{active.jobId}</span>
                        <PhaseLabel job={active} />
                      </span>
                      <Icon.ChevronRight size={16} className="text-ink-3" />
                    </Link>
                  ) : (
                    <span className="text-ink-3">No job in progress · last hired {new Date(latest.hiredAt).toLocaleDateString()}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <LinkButton href={`/hire/${latest.agentChainId}/${latest.agentTokenId}`} size="s">
                    Hire again
                  </LinkButton>
                  <LinkButton href={`/agents/${latest.agentChainId}/${latest.agentTokenId}`} size="s" intent="secondary">
                    View agent
                  </LinkButton>
                  <LinkButton href={`/workspace/jobs?agent=${key}`} size="s" intent="ghost">
                    History
                  </LinkButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-[12.5px] text-ink-3">Hiring never grants an agent access to your wallet, so there are no permissions here to revoke.</p>
    </>
  );
}

/* ───────────────────────── Saved ───────────────────────── */

export function SavedPage() {
  const saved = useSavedAgents();
  return (
    <>
      <PageHeader title="Saved agents" description="Saved on this device. Pokter re-checks them in the background and tells you when evidence, availability or price changes." />
      <EmailLinkNotice kind="agents" />
      {saved.length === 0 ? (
        <EmptyState title="Nothing saved yet" action={<LinkButton href="/discover">Browse agents</LinkButton>}>
          Use Save on any agent page to keep an eye on it.
        </EmptyState>
      ) : (
        <ul className="ruled border-y border-rule">
          {saved.map((a) => (
            <li key={`${a.chainId}:${a.tokenId}`} className="flex items-center gap-4 py-4">
              <AgentAvatar name={a.name} imageUrl={a.imageUrl} seed={`${a.chainId}:${a.tokenId}`} size={40} />
              <Link href={`/agents/${a.chainId}/${a.tokenId}`} className="min-w-0 flex-1">
                <p className="truncate font-medium hover:underline">{a.name}</p>
                <p className="truncate text-[13px] text-ink-3">{a.description}</p>
              </Link>
              <span className="hidden text-[12px] text-ink-3 sm:inline">saved {new Date(a.savedAt).toLocaleDateString()}</span>
              <Button intent="ghost" size="s" onClick={() => toggleSavedAgent(a)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ───────────────────────── Inbox ───────────────────────── */

export function InboxPage() {
  const notes = useInbox();
  const alerts = useSavedAlerts();
  const requestAlerts = useRequestAlerts();
  const { address } = useActiveWallet();
  const sync = useReadSync();
  const items = [
    ...notes.map((n) => ({ id: n.id, kind: 'job' as const, title: n.title, body: n.body, at: n.createdAt, createdAt: n.createdAt, readAt: n.readAt, href: n.chainId ? jobHref({ jobId: n.jobId, chainId: n.chainId }) : `/workspace/jobs/${n.jobId}`, action: n.status === 'SUBMITTED' || n.status === 'EXPIRED' })),
    ...alerts.map((a) => ({ id: a.id, kind: 'agent' as const, title: a.title, body: a.body, at: a.createdAt, createdAt: a.createdAt, readAt: a.readAt, href: `/agents/${a.agentId.replace(':', '/')}`, action: false })),
    ...requestAlerts.map((r) => ({ id: r.id, kind: 'request' as const, title: r.title, body: r.body, at: r.createdAt, createdAt: r.createdAt, readAt: r.readAt, href: `/requests/${r.requestId}`, action: false })),
  ]
    .map((item) => ({ ...item, read: sync.isRead(item) }))
    .sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  const unread = items.filter((i) => !i.read).length;

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Job updates, changes to agents you saved, and requests your agents could answer. Items that need a decision are marked."
        action={
          unread > 0 ? (
            <Button
              intent="secondary"
              size="s"
              onClick={() => {
                if (address) markAllNotificationsRead(address);
                markSavedAgentAlertsRead();
                if (address) markRequestAlertsRead(address);
                /*
                 * The shared marker moves with the local one, so a buyer
                 * who clears this on a laptop does not come back to a
                 * badged phone. It takes the newest item's own timestamp,
                 * so anything arriving after this click stays unread.
                 */
                sync.markSeen(items);
              }}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />
      <EmailLinkNotice kind="jobs" />
      <ReadSyncRow sync={sync} />
      {items.length === 0 && !address ? (
        /* "All quiet" is only true after a load: with no wallet, job updates were never read. */
        <NeedsWallet what="your job updates" />
      ) : items.length === 0 ? (
        <EmptyState title="All quiet">Updates appear here when a job you funded changes state, a saved agent&rsquo;s evidence, availability or price changes, or a request is posted in a category your agents are listed under.</EmptyState>
      ) : (
        <ul className="ruled border-y border-rule">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                onClick={() => (item.kind === 'job' ? markNotificationRead(item.id) : item.kind === 'request' ? markRequestAlertRead(item.id) : undefined)}
                className={cn('grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 py-4 hover:bg-sunken/40', item.read && 'opacity-70')}
              >
                <span className="mt-1.5 flex justify-center">{!item.read && <span className="size-2 rounded-full bg-signal" aria-label="Unread" />}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-[14.5px] font-medium">
                    {item.title}
                    {item.action && <span className="rounded-[5px] bg-watch-wash px-1.5 py-px text-[11px] font-medium text-watch">Action</span>}
                  </span>
                  <span className="text-[13px] text-ink-2">{item.body}</span>
                </span>
                <span className="text-[12px] text-ink-3">{new Date(item.at).toLocaleDateString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The one line offering to share read state, and nothing more than a line.
 *
 * Off by default and signed for once. Moving the marker can hide an unread
 * "delivery ready" badge, which is how a review window gets missed, so it
 * is not something that should happen because a stranger knows a public
 * address.
 */
function ReadSyncRow({ sync }: { sync: ReturnType<typeof useReadSync> }) {
  if (!sync.available) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-rule bg-raised px-4 py-3">
      <p className="text-[13px] text-ink-2">
        {sync.syncing
          ? 'What you have read here shows as read on your other devices.'
          : 'Read state stays on this device. Sign once to share it with your phone and laptop.'}
      </p>
      <div className="flex items-center gap-3">
        {sync.error && <span className="text-[12.5px] text-bad">{sync.error}</span>}
        <Button
          intent="ghost"
          size="s"
          busy={sync.busy}
          disabled={sync.busy}
          onClick={() => void (sync.syncing ? sync.disable() : sync.enable())}
        >
          {sync.syncing ? 'Stop sharing' : 'Share across devices'}
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Wallet ───────────────────────── */

/* Sends $U or gas. `paymentDecimals` is the registry's for $U on this chain, not a literal. */
function SendForm({ native, payment, paymentDecimals, onSent }: { native: bigint; payment: bigint; paymentDecimals: number; onSent: () => void }) {
  const w = useWalletState();
  const signer = usePasskeySigner();
  const [token, setToken] = useState<SendableToken>('payment');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const raw = parseAmount(amount);
  const problem = describeSendProblem({ token, to, amount: raw, nativeBalance: native, paymentBalance: payment, nativeSymbol: NATIVE_SYMBOL, paymentSymbol: '$U' });
  const most = token === 'native' ? sendableNative(native) : payment;
  const mostDecimals = token === 'native' ? 18 : paymentDecimals;

  return (
    <div className="flex flex-col gap-4">
      <Segmented label="Token" value={token} onChange={setToken} options={[{ value: 'payment', label: '$U' }, { value: 'native', label: NATIVE_SYMBOL }]} />
      <Field label="To address" hint="Double-check it. Transfers cannot be reversed.">
        {(props) => <Input {...props} value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" className="t-readout" autoComplete="off" spellCheck={false} />}
      </Field>
      <Field label="Amount" hint={`Up to ${Number(formatUnits(most, mostDecimals)).toLocaleString('en-US', { maximumFractionDigits: 5 })}${token === 'native' ? ' (a little is kept for the fee)' : ''}`}>
        {(props) => (
          <div className="flex gap-2">
            <Input {...props} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="t-readout" />
            <Button intent="secondary" onClick={() => setAmount(formatUnits(most, mostDecimals))}>
              Max
            </Button>
          </div>
        )}
      </Field>
      {amount && to && problem && <Notice tone="watch">{problem}</Notice>}
      {error && <Notice tone="bad">{/reject|cancel|NotAllowed/i.test(error) ? 'You declined with your passkey. Nothing was sent.' : error}</Notice>}
      {sent && (
        <Notice tone="ok" title="Sent">
          <TxLink hash={sent} label="View the transaction" />
        </Notice>
      )}
      <Button
        onClick={async () => {
          if (!w.passkey.wallet) return;
          setBusy(true);
          setError(null);
          setSent(null);
          try {
            const hash = await sendFromPasskey({ wallet: { address: w.passkey.wallet.address }, signer, plan: { token, to: to.trim() as Address, amount: raw } });
            setSent(hash);
            setAmount('');
            onSent();
          } catch (cause) {
            setError((cause as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        disabled={Boolean(problem) || !to || !amount}
        busy={busy}
        className="self-start"
      >
        Send {amount || ''} {token === 'native' ? NATIVE_SYMBOL : '$U'}
      </Button>
    </div>
  );
}

export function WalletPage() {
  const w = useWalletState();
  const { jobs } = useMyJobs();
  const [send, setSend] = useState(false);
  const now = useNow();
  if (!w.address) {
    return (
      <>
        <PageHeader title="Wallet and payments" />
        <NeedsWallet what="your balances and payments" />
      </>
    );
  }
  const phases = jobs.map((j) => ({ j, p: jobPhase(j, now) }));
  // One line per chain and token, as on the overview: real and test money
  // are never added together, nor $U and USDT, and a job whose token has not
  // been read is counted as such rather than as $U.
  const sum = (filter: JobPhase[]) => totalLines(phases.filter(({ p }) => filter.includes(p)).map(({ j }) => j));
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  /* The send form moves $U and gas only; its decimals come from the registry entry. */
  const sendable = w.balances.tokens.find((t) => t.isDefault) ?? null;
  return (
    <>
      <PageHeader title="Wallet and payments" description={`What this wallet holds on ${w.balances.chainId === null ? NETWORK_LABEL : chainLabel(w.balances.chainId)}, the network it is on now, and where your job payments went on each network.`} />
      {IS_TESTNET && <Notice tone="neutral" className="mb-6">{PAYMENT_VALUE_NOTE}</Notice>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-[14px] border border-rule bg-raised p-5 sm:col-span-1">
          <span className="t-label">{w.mode === 'passkey' ? 'Passkey wallet' : (w.connectorName ?? 'Browser wallet')}</span>
          <AddressView address={w.address} />
          <span className="text-[12px] text-ink-3">{w.mode === 'passkey' ? 'A smart account secured by your passkey.' : 'Signs in your browser wallet.'}</span>
        </div>
        {/* Every token Pokter offers for a hire on this chain, each in its own decimals; $U first. */}
        {(w.balances.tokens.length ? w.balances.tokens : [null]).map((t) => (
          <div key={t?.address ?? 'payment'} className="flex flex-col gap-1 rounded-[14px] border border-rule bg-raised p-5">
            <span className="t-label">{t?.symbol ?? '$U'}</span>
            <span className="t-readout text-2xl">{t?.amount == null ? '—' : fmt(t.amount)}</span>
            <span className="text-[12px] text-ink-3">{w.balances.chainId === 97 ? 'Pays for test jobs · no value' : 'Pays for jobs'}</span>
          </div>
        ))}
        <div className="flex flex-col gap-1 rounded-[14px] border border-rule bg-raised p-5">
          <span className="t-label">{NATIVE_SYMBOL}</span>
          <span className="t-readout text-2xl">{w.balances.native === null ? '—' : fmt(w.balances.native)}</span>
          <span className="text-[12px] text-ink-3">Pays network fees</span>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button intent="secondary" size="s" onClick={w.refreshBalances} icon={<Icon.Refresh size={14} />}>
          Refresh balances
        </Button>
        {w.mode === 'passkey' && (
          <Button intent="secondary" size="s" onClick={() => setSend((v) => !v)} icon={<Icon.Send size={14} />}>
            Send tokens
          </Button>
        )}
        {IS_TESTNET && FAUCETS && (
          <>
            <LinkButton href={FAUCETS.paymentTokenBot?.url ?? FAUCETS.paymentToken} target="_blank" intent="ghost" size="s" trailing={<Icon.ArrowUpRight size={13} />}>
              Get test $U
            </LinkButton>
            <LinkButton href={FAUCETS.native} target="_blank" intent="ghost" size="s" trailing={<Icon.ArrowUpRight size={13} />}>
              Get test {NATIVE_SYMBOL}
            </LinkButton>
          </>
        )}
      </div>
      {IS_TESTNET && FAUCETS?.paymentTokenBot && (
        <p className="mt-2 text-[12.5px] text-ink-3">
          The bot takes a sentence. Send it: <span className="t-readout break-all">{FAUCETS.paymentTokenBot.bothAsk.replace('ADDRESS', w.address)}</span>
        </p>
      )}

      {send && w.mode === 'passkey' && sendable && (
        <section className="mt-6 max-w-md rounded-[14px] border border-rule bg-raised p-5">
          <SendForm
            native={w.balances.native !== null ? parseUnits(String(w.balances.native), 18) : 0n}
            payment={sendable.raw ?? 0n}
            paymentDecimals={sendable.decimals}
            onSent={w.refreshBalances}
          />
        </section>
      )}

      <section className="mt-10" aria-labelledby="pay-title">
        <h2 id="pay-title" className="t-label mb-3">
          Job payments
        </h2>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ['In escrow', sum(['working', 'review', 'reclaim'])],
            ['Released to agents', sum(['settled'])],
            ['Returned to you', sum(['refunded', 'expired', 'rejected'])],
            ['In dispute', sum(['disputed'])],
          ] as const).map(([label, value]) => {
            const total = approxTotalView(value);
            return (
              <div key={label} className="rounded-[12px] border border-rule px-4 py-3">
                <span className="t-label">{label}</span>
                {/* One figure; every exact amount on hover or tap, test tokens and unread currencies listed apart. */}
                <p className="t-readout mt-1 text-lg">
                  <MoneyTotal total={total} />
                </p>
                {total.caption && <p className="text-[12px] text-ink-3">{total.caption}</p>}
              </div>
            );
          })}
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-ink-3">No job payments yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-ink-3">
                <th className="t-label py-2 font-medium">Job</th>
                <th className="t-label hidden py-2 font-medium sm:table-cell">Agent</th>
                <th className="t-label py-2 font-medium">Where it is</th>
                <th className="t-label py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="py-3">
                    <Link href={jobHref(j)} className="t-readout link">
                      #{j.jobId}
                    </Link>
                  </td>
                  <td className="hidden py-3 sm:table-cell">{j.agentName}</td>
                  <td className="py-3">{PHASE[jobPhase(j, now)].label}</td>
                  <td className="t-readout py-3 text-right">{budgetOf(j)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
