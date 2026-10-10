'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { formatUnits, parseUnits, type Address } from 'viem';

import { FAUCETS, IS_TESTNET, NATIVE_SYMBOL, NETWORK_LABEL, PAYMENT_VALUE_NOTE } from '@/lib/network/presentation';
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
import { jobPhase, PHASE, useInbox, useMyJobs, useNow, useSavedAgents, useSavedAlerts, type JobPhase } from './hooks';
import { budgetOf, JobRow, NeedsWallet, PageHeader, PhaseLabel } from './parts';
import { RecoverJob } from './RecoverJob';

/* ───────────────────────── Jobs ───────────────────────── */

const FILTERS: Array<{ id: string; label: string; phases: JobPhase[] | null }> = [
  { id: 'all', label: 'All', phases: null },
  { id: 'active', label: 'In progress', phases: ['working'] },
  { id: 'attention', label: 'Needs you', phases: ['review', 'reclaim'] },
  { id: 'done', label: 'Settled', phases: ['settled'] },
  { id: 'failed', label: 'Disputed or refunded', phases: ['disputed', 'refunded', 'expired', 'unfunded'] },
];

export function JobsPage() {
  const { jobs, address } = useMyJobs();
  const sp = useSearchParams();
  const filter = FILTERS.find((f) => f.id === sp.get('filter')) ?? FILTERS[0];
  const now = useNow();
  if (!address) {
    return (
      <>
        <PageHeader title="Jobs" />
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
      <PageHeader title="Jobs" description="Every job this wallet has funded through Pokter, read from this device and refreshed from chain when opened." action={<RecoverJob compact />} />
      {agent && scoped[0] && (
        <p className="mb-3 text-sm text-ink-2">
          Showing jobs for <strong className="font-medium text-ink">{scoped[0].agentName}</strong> ·{' '}
          <Link href="/workspace/jobs" className="link">
            all agents
          </Link>
        </p>
      )}
      <TabLinks label="Filter jobs" active={filter.id} tabs={counted.map((f) => ({ id: f.id, label: f.label, href: f.id === 'all' ? '/workspace/jobs' : `/workspace/jobs?filter=${f.id}`, count: f.count }))} className="mb-2" />
      {shown.length === 0 ? (
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
                    <Link href={`/workspace/jobs/${active.jobId}`} className="flex items-center justify-between gap-2">
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
  const { address } = useActiveWallet();
  const sp = useSearchParams();
  const email = sp.get('email');
  const items = [
    ...notes.map((n) => ({ id: n.id, kind: 'job' as const, title: n.title, body: n.body, at: n.createdAt, read: Boolean(n.readAt), href: `/workspace/jobs/${n.jobId}`, action: n.status === 'SUBMITTED' || n.status === 'EXPIRED' })),
    ...alerts.map((a) => ({ id: a.id, kind: 'agent' as const, title: a.title, body: a.body, at: a.createdAt, read: Boolean(a.readAt), href: `/agents/${a.agentId.replace(':', '/')}`, action: false })),
  ].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  const unread = items.filter((i) => !i.read).length;

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Job updates and changes to agents you saved. Items that need a decision are marked."
        action={
          unread > 0 ? (
            <Button
              intent="secondary"
              size="s"
              onClick={() => {
                if (address) markAllNotificationsRead(address);
                markSavedAgentAlertsRead();
              }}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />
      {email === 'verified' && <Notice tone="ok" className="mb-6" title="Email confirmed">You will get an email when a job you follow changes state.</Notice>}
      {email === 'unsubscribed' && <Notice tone="neutral" className="mb-6" title="Unsubscribed">No more job emails will be sent to that address.</Notice>}
      {email === 'invalid' && <Notice tone="watch" className="mb-6" title="That link has expired">Subscribe again from a job page if you still want emails.</Notice>}
      {items.length === 0 ? (
        <EmptyState title="All quiet">Updates appear here when a job you funded changes state, or a saved agent&rsquo;s evidence, availability or price changes.</EmptyState>
      ) : (
        <ul className="ruled border-y border-rule">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                onClick={() => item.kind === 'job' && markNotificationRead(item.id)}
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

/* ───────────────────────── Wallet ───────────────────────── */

function SendForm({ native, payment, onSent }: { native: bigint; payment: bigint; onSent: () => void }) {
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

  return (
    <div className="flex flex-col gap-4">
      <Segmented label="Token" value={token} onChange={setToken} options={[{ value: 'payment', label: '$U' }, { value: 'native', label: NATIVE_SYMBOL }]} />
      <Field label="To address" hint="Double-check it. Transfers cannot be reversed.">
        {(props) => <Input {...props} value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" className="t-readout" autoComplete="off" spellCheck={false} />}
      </Field>
      <Field label="Amount" hint={`Up to ${Number(formatUnits(most, 18)).toLocaleString('en-US', { maximumFractionDigits: 5 })}${token === 'native' ? ' (a little is kept for the fee)' : ''}`}>
        {(props) => (
          <div className="flex gap-2">
            <Input {...props} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="t-readout" />
            <Button intent="secondary" onClick={() => setAmount(formatUnits(most, 18))}>
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
  const sum = (filter: JobPhase[]) => phases.filter(({ p }) => filter.includes(p)).reduce((s, { j }) => s + Number(formatUnits(BigInt(j.budgetRaw), 18)), 0);
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 });

  return (
    <>
      <PageHeader title="Wallet and payments" description={`What this wallet holds on ${NETWORK_LABEL}, and where your job payments went.`} />
      {IS_TESTNET && <Notice tone="neutral" className="mb-6">{PAYMENT_VALUE_NOTE}</Notice>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-[14px] border border-rule bg-raised p-5 sm:col-span-1">
          <span className="t-label">{w.mode === 'passkey' ? 'Passkey wallet' : (w.connectorName ?? 'Browser wallet')}</span>
          <AddressView address={w.address} />
          <span className="text-[12px] text-ink-3">{w.mode === 'passkey' ? 'A smart account secured by your passkey.' : 'Signs in your browser wallet.'}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-[14px] border border-rule bg-raised p-5">
          <span className="t-label">$U</span>
          <span className="t-readout text-2xl">{w.balances.payment === null ? '—' : fmt(w.balances.payment)}</span>
          <span className="text-[12px] text-ink-3">Pays for jobs</span>
        </div>
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

      {send && w.mode === 'passkey' && (
        <section className="mt-6 max-w-md rounded-[14px] border border-rule bg-raised p-5">
          <SendForm native={w.balances.native !== null ? parseUnits(String(w.balances.native), 18) : 0n} payment={w.balances.payment !== null ? parseUnits(String(w.balances.payment), 18) : 0n} onSent={w.refreshBalances} />
        </section>
      )}

      <section className="mt-10" aria-labelledby="pay-title">
        <h2 id="pay-title" className="t-label mb-3">
          Job payments
        </h2>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['In escrow', sum(['working', 'review', 'reclaim'])],
            ['Released to agents', sum(['settled'])],
            ['Returned to you', sum(['refunded', 'expired'])],
            ['In dispute', sum(['disputed'])],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-[12px] border border-rule px-4 py-3">
              <span className="t-label">{label}</span>
              <p className="t-readout mt-1 text-lg">{fmt(value as number)} $U</p>
            </div>
          ))}
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
                    <Link href={`/workspace/jobs/${j.jobId}`} className="t-readout link">
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
