'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { isAddress } from 'viem';

import type { CampaignProgressReport } from '@/lib/campaign/progress-server';
import { registrationKey, REGISTRATION_EVENT, subscribeToRegistration } from '@/lib/campaign/registration';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { useActiveWallet } from '@/lib/wallet/active';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { WalletRoot } from '@/shell/wallet/WalletRoot';
import { Button, LinkButton } from '@/ui/Button';
import { Notice, Skeleton } from '@/ui/Feedback';
import { Checkbox, Input } from '@/ui/Field';
import { Icon } from '@/ui/icons';

type StepState = 'done' | 'partial' | 'todo' | 'unknown';

/**
 * The top of the Set and Earn page: where this wallet stands on each of
 * the four things the campaign asks, and reminders by email.
 *
 * Everything shown is read from public sources for the wallet in view —
 * the connected one, or any address pasted in, the way /quest works.
 * Registering with BNB Chain is the exception: Pokter cannot see that
 * form, so the person ticks it themselves and it is labelled as theirs.
 */
export default function SetAndEarnPanel({ rulesUrl }: { rulesUrl: string }) {
  return (
    <WalletRoot>
      <Panel rulesUrl={rulesUrl} />
    </WalletRoot>
  );
}

function Panel({ rulesUrl }: { rulesUrl: string }) {
  const { address: connected, mode } = useActiveWallet();
  const { openConnect } = useConnect();
  // A reminder email links back with ?address=, so the page opens on that wallet. Client-only (the panel is not server-rendered).
  const [pasted, setPasted] = useState<string | null>(() => {
    const fromLink = new URLSearchParams(window.location.search).get('address');
    return fromLink && isAddress(fromLink) ? fromLink : null;
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  /* Keyed by the address it was read for, so a switch of wallet shows loading rather than the last wallet's steps. */
  const [fetched, setFetched] = useState<{ address: string; report?: CampaignProgressReport; error?: string } | null>(null);

  const address = pasted ?? connected ?? null;

  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch(`/api/campaign/progress?address=${address}`)
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as CampaignProgressReport & { error?: string };
        if (!r.ok) throw new Error(body.error ?? 'Progress could not be read just now.');
        if (live) setFetched({ address, report: body });
      })
      .catch((e: Error) => live && setFetched({ address, error: e.message }));
    return () => {
      live = false;
    };
  }, [address]);

  const current = fetched && address && fetched.address === address ? fetched : null;
  const report = current?.report ?? null;
  const error = current?.error ?? null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <section aria-labelledby="progress-title" className="flex flex-col rounded-[18px] border border-rule bg-raised">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-4">
          <h2 id="progress-title" className="text-[17px] font-semibold">
            Your progress
          </h2>
          {address && !editing && (
            <span className="flex items-center gap-2 text-[12.5px] text-ink-3">
              <span className="t-readout rounded-full bg-sunken px-2.5 py-1 text-ink-2">{shortAddress(address)}</span>
              <button type="button" onClick={() => { setDraft(''); setEditing(true); }} className="font-medium text-ink-2 hover:text-ink">
                Check another wallet
              </button>
            </span>
          )}
        </header>

        {mode === 'passkey' && !pasted && (
          <div className="px-5 pt-4">
            <Notice tone="watch" title="This is a passkey wallet">
              It only works on Pokter, so it cannot be your campaign wallet across two marketplaces. Connect the extension or mobile wallet you registered.
            </Notice>
          </div>
        )}

        {editing || !address ? (
          <AddressEntry
            draft={draft}
            setDraft={setDraft}
            canCancel={Boolean(address)}
            onCancel={() => setEditing(false)}
            onConnect={() => openConnect('to see your Set and Earn progress')}
            onSubmit={(value) => {
              setPasted(value);
              setEditing(false);
            }}
            onUseConnected={connected ? () => { setPasted(null); setEditing(false); } : null}
          />
        ) : error ? (
          <div className="p-5">
            <Notice tone="bad">{error}</Notice>
          </div>
        ) : !report ? (
          <div className="flex flex-col gap-3 p-5" aria-busy>
            <Skeleton className="h-3 w-full" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <Steps report={report} rulesUrl={rulesUrl} />
        )}
      </section>

      <Reminders wallet={address} />
    </div>
  );
}

function AddressEntry({
  draft,
  setDraft,
  canCancel,
  onCancel,
  onConnect,
  onSubmit,
  onUseConnected,
}: {
  draft: string;
  setDraft: (v: string) => void;
  canCancel: boolean;
  onCancel: () => void;
  onConnect: () => void;
  onSubmit: (address: string) => void;
  onUseConnected: (() => void) | null;
}) {
  const valid = isAddress(draft.trim());
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col items-start gap-3">
        <p className="text-[14px] text-ink-2">Connect the wallet you registered to see each step, read from BNB Chain. Nothing is signed.</p>
        {onUseConnected ? (
          <Button onClick={onUseConnected}>Use my connected wallet</Button>
        ) : (
          <Button onClick={onConnect} icon={<Icon.Wallet size={15} aria-hidden />}>
            Connect wallet
          </Button>
        )}
      </div>
      <form
        className="flex flex-col gap-2 border-t border-rule pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(draft.trim());
        }}
      >
        <label htmlFor="campaign-address" className="text-[12.5px] text-ink-3">
          Or check any address
        </label>
        <div className="flex gap-2">
          <Input id="campaign-address" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0x…" className="t-readout min-w-0 flex-1" spellCheck={false} autoComplete="off" />
          <Button type="submit" intent="secondary" disabled={!valid} className="shrink-0 self-stretch">
            Check
          </Button>
        </div>
      </form>
      {canCancel && (
        <button type="button" onClick={onCancel} className="self-start text-[13px] text-ink-3 hover:text-ink">
          Cancel
        </button>
      )}
    </div>
  );
}

function Steps({ report, rulesUrl }: { report: CampaignProgressReport; rulesUrl: string }) {
  const registered = useSyncExternalStore(
    subscribeToRegistration,
    () => window.localStorage.getItem(registrationKey(report.address)) === 'yes',
    () => false,
  );
  const setRegistered = (value: boolean) => {
    try {
      window.localStorage.setItem(registrationKey(report.address), value ? 'yes' : 'no');
      window.dispatchEvent(new Event(REGISTRATION_EVENT));
    } catch {
      /* Remembered for this page only. */
    }
  };

  const h = report.hires;
  const hireState: StepState = h.distinctAgents >= 3 && h.marketplacesStatus === 'met' ? 'done' : h.distinctAgents > 0 ? 'partial' : 'todo';
  const inWindow = report.build?.find((a) => a.inWindow === true) ?? null;
  const buildState: StepState = report.build === null ? 'unknown' : inWindow ? 'done' : 'todo';
  const a = report.adoption;
  const adoptionDone = Boolean(a && a.independentWallets >= 3 && a.actions >= 5 && a.activeDays >= 3);
  const adoptionState: StepState = !inWindow ? 'todo' : adoptionDone ? 'done' : a && (a.independentWallets || a.actions) ? 'partial' : 'todo';
  const states: StepState[] = [registered ? 'done' : 'todo', hireState, buildState, adoptionState];
  const done = states.filter((s) => s === 'done').length;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 px-5 pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13.5px] font-medium">
            {done === 4 ? 'Everything Pokter can see is done' : `${done} of 4 done`}
          </span>
          <span className="text-[12px] text-ink-3">BNB Chain decides who qualifies</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5" aria-hidden>
          {states.map((s, i) => (
            <span key={i} className={cn('h-1.5 rounded-full', s === 'done' ? 'bg-ok' : s === 'partial' ? 'bg-ok/40' : 'bg-sunken')} />
          ))}
        </div>
      </div>

      <ol className="ruled mt-2 px-5">
        <Step
          n={1}
          state={states[0]}
          title="Register this wallet with BNB Chain"
          status={registered ? 'Marked as registered by you. Pokter cannot see BNB Chain’s form.' : 'Actions from an unregistered wallet do not count, including earlier ones.'}
          action={
            <div className="flex flex-col items-end gap-1.5">
              <a href={rulesUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
                Register <Icon.ArrowUpRight size={13} aria-hidden />
              </a>
              <Checkbox checked={registered} onChange={(e) => setRegistered(e.target.checked)} label="I have registered" className="text-[12.5px]" />
            </div>
          }
        />
        <Step
          n={2}
          state={states[1]}
          title="Hire three different agents"
          status={
            <>
              <Meter value={h.distinctAgents} target={3} label="agents" />
              <span className="block">
                {h.marketplacesStatus === 'met'
                  ? `On ${h.marketplaces.join(' and ')}: two marketplaces, as required.`
                  : h.marketplacesStatus === 'likely'
                    ? `${h.marketplaces[0]} is named; ${h.unattributed} other hire${h.unattributed === 1 ? ' does' : 's do'} not say where it was made.`
                    : h.marketplaces.length === 1
                      ? `All on ${h.marketplaces[0]} so far. At least two marketplaces are needed.`
                      : 'At least two different marketplaces are needed. Pokter can be one.'}
              </span>
            </>
          }
          action={
            <LinkButton href="/discover?hireable=1" size="s" intent={hireState === 'done' ? 'secondary' : 'primary'}>
              Find an agent
            </LinkButton>
          }
        />
        <Step
          n={3}
          state={states[2]}
          title="Build and list an agent of your own"
          status={
            report.build === null
              ? 'The registry did not answer, so this could not be checked. Try again shortly.'
              : inWindow
                ? `${inWindow.name}, registered after the Phase 2 announcement.`
                : report.build.length > 0
                  ? `This wallet owns ${report.build.length} agent${report.build.length === 1 ? '' : 's'}, all registered before 2 October, which do not count.`
                  : 'No agent is registered to this wallet yet.'
          }
          action={
            <LinkButton href="/build" size="s" intent={buildState === 'done' ? 'secondary' : 'primary'}>
              Builder Studio
            </LinkButton>
          }
        />
        <Step
          n={4}
          state={states[3]}
          title="Get it hired and active"
          status={
            !inWindow ? (
              'Starts once your agent is registered: three outside hirers, and five on-chain actions over three days.'
            ) : (
              <>
                <span className="flex flex-wrap gap-x-5 gap-y-1">
                  <Meter value={a?.independentWallets ?? 0} target={3} label="outside hirers" />
                  <Meter value={a?.actions ?? 0} target={5} label="actions" />
                  <Meter value={a?.activeDays ?? 0} target={3} label="active days" />
                </span>
                {a?.actionsBlockedReason && <span className="block text-watch">{a.actionsBlockedReason}</span>}
              </>
            )
          }
          action={
            <LinkButton href="/build" size="s" intent="secondary">
              Adoption
            </LinkButton>
          }
        />
      </ol>
      <p className="border-t border-rule px-5 py-3.5 text-[12px] text-ink-3">
        Hires are read from BNB Chain&rsquo;s ERC-8183 escrow contracts and agents from the ERC-8004 registry. A marketplace that settles through a contract of its own is not visible here.
      </p>
    </div>
  );
}

function Step({ n, state, title, status, action }: { n: number; state: StepState; title: string; status: React.ReactNode; action: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
          state === 'done' ? 'bg-ok text-paper' : state === 'partial' ? 'border-2 border-ok text-ok' : 'border border-rule-strong text-ink-3',
        )}
        aria-label={state === 'done' ? 'Done' : state === 'partial' ? 'In progress' : state === 'unknown' ? 'Could not check' : 'Not yet'}
      >
        {state === 'done' ? <Icon.Check size={14} aria-hidden /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] leading-snug text-ink-2">{status}</span>
      </div>
      <div className="shrink-0 sm:pt-0.5">{action}</div>
    </li>
  );
}

function Meter({ value, target, label }: { value: number; target: number; label: string }) {
  const shown = Math.min(value, target);
  return (
    <span className="inline-flex items-center gap-2 py-0.5">
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: target }, (_, i) => (
          <span key={i} className={cn('size-2 rounded-full', i < shown ? 'bg-ok' : 'bg-sunken ring-1 ring-rule-strong')} />
        ))}
      </span>
      <span className="t-readout text-[12.5px] text-ink">
        {value} of {target}
      </span>
      <span className="text-[12.5px] text-ink-3">{label}</span>
    </span>
  );
}

function Reminders({ wallet }: { wallet: string | null }) {
  const [email, setEmail] = useState('');
  const [deadline, setDeadline] = useState(true);
  const [progress, setProgress] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Where a confirm or unsubscribe link landed (?email=verified|unsubscribed).
  const [linkState] = useState(() => new URLSearchParams(window.location.search).get('email'));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState('sending');
    try {
      const r = await fetch('/api/campaign/reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, wallet: progress ? wallet : null, deadline, progress: progress && Boolean(wallet) }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'That did not go through.');
      setState('sent');
    } catch (caught) {
      setError((caught as Error).message);
      setState('idle');
    }
  };

  return (
    <aside aria-labelledby="reminders-title" className="flex flex-col gap-4 rounded-[18px] border border-rule bg-raised p-5 lg:sticky lg:top-24">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-sunken text-ink-2">
          <Icon.Bell size={15} aria-hidden />
        </span>
        <h2 id="reminders-title" className="text-[17px] font-semibold">
          Reminders
        </h2>
      </div>
      {linkState === 'verified' ? (
        <Notice tone="ok" title="Reminders are on">Each email has a link to stop them.</Notice>
      ) : linkState === 'unsubscribed' ? (
        <Notice title="Reminders are off">You will not get any more Set and Earn emails.</Notice>
      ) : null}
      {state === 'sent' ? (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] font-medium">Check your inbox</p>
          <p className="text-[13px] text-ink-2">We sent a link to {email}. Nothing is sent until you confirm it.</p>
          <button type="button" onClick={() => setState('idle')} className="self-start text-[13px] font-medium text-ink-2 hover:text-ink">
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <p className="text-[13.5px] text-ink-2">The build track needs three separate days of activity, so it cannot be rushed at the end. Get a nudge in time.</p>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email address" autoComplete="email" />
          <div className="flex flex-col gap-2.5">
            <Checkbox checked={deadline} onChange={(e) => setDeadline(e.target.checked)} label="Before entries close" description="One week, two days and one day before." />
            <Checkbox
              checked={progress && Boolean(wallet)}
              disabled={!wallet}
              onChange={(e) => setProgress(e.target.checked)}
              label="When this wallet hires another agent"
              description={wallet ? `Watching ${shortAddress(wallet)}.` : 'Connect or paste a wallet above first.'}
            />
          </div>
          {error && <p className="text-[12.5px] text-bad">{error}</p>}
          <Button type="submit" busy={state === 'sending'} disabled={!deadline && !(progress && wallet)}>
            Turn on reminders
          </Button>
          <p className="text-[11.5px] text-ink-3">We email a link to confirm first. Every reminder has a one-click way to stop.</p>
        </form>
      )}
    </aside>
  );
}
