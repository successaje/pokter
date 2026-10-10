'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { getAddress } from 'viem';

import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { DRAFTS_KEY, announceDraftsChanged, draftProgress, draftTitle, draftsServerSnapshot, draftsSnapshot, subscribeToDrafts, type DraftRecord } from '@/lib/builder/drafts';
import type { DiagnosticReport } from '@/lib/diagnostic/checks';
import { builderReadinessSteps, nextBuilderAction, type BuilderLifecycle } from '@/lib/diagnostic/builder-lifecycle';
import { summarizeQuality } from '@/lib/builder/quality';
import { connectIdentityWallet, hasIdentityWallet, signIdentityMessage } from '@/lib/registry/wallet';
import { useActiveWallet } from '@/lib/wallet/active';
import { usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { AgentAvatar } from '@/ui/Agent';
import { Button, LinkButton } from '@/ui/Button';
import { Segmented } from '@/ui/Controls';
import { EmptyState, Notice, Skeleton } from '@/ui/Feedback';
import { Field, Input } from '@/ui/Field';
import { Icon } from '@/ui/icons';

/* ───────── Builder alerts (session) ───────── */

type BuilderAlert = { id: string; jobId: string; agentName: string; event: string; title: string; body: string; createdAt: string; readAt: string | null };

export function BuilderAlerts() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inbox = useQuery({
    queryKey: ['builder-notifications'],
    queryFn: async () => {
      const r = await fetch('/api/builders/notifications', { cache: 'no-store' });
      if (!r.ok) throw new Error('Alerts could not be loaded.');
      return (await r.json()) as { items: BuilderAlert[]; unread: number };
    },
    refetchInterval: 60_000,
  });
  const emailStatus = useQuery({
    queryKey: ['builder-email-status'],
    queryFn: async () => (await (await fetch('/api/builders/notifications/email', { cache: 'no-store' })).json()) as { configured: boolean; verified: boolean; emailMasked: string | null },
  });

  async function markRead(id?: string) {
    await fetch('/api/builders/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(id ? { id } : {}) });
    await qc.invalidateQueries({ queryKey: ['builder-notifications'] });
  }
  async function subscribe(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    try {
      const r = await fetch('/api/builders/notifications/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Could not start email verification.');
      setEmail('');
      setMessage('Check your inbox and confirm the link.');
      await qc.invalidateQueries({ queryKey: ['builder-email-status'] });
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const items = inbox.data?.items ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="t-label">Alerts {inbox.data?.unread ? <span className="ml-1 text-ink">({inbox.data.unread} new)</span> : null}</h2>
        {Boolean(inbox.data?.unread) && (
          <button type="button" onClick={() => void markRead()} className="text-[12.5px] text-ink-3 hover:text-ink">
            Mark all read
          </button>
        )}
      </div>
      {inbox.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : items.length === 0 ? (
        <p className="text-[13px] text-ink-3">No alerts. You will hear here when a buyer funds, disputes or settles a job for your agents.</p>
      ) : (
        <ul className="ruled border-y border-rule">
          {items.slice(0, 6).map((a) => (
            <li key={a.id} className={cn('flex gap-3 py-3', a.readAt && 'opacity-60')}>
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: a.readAt ? 'transparent' : 'var(--signal)' }} />
              <button type="button" onClick={() => void markRead(a.id)} className="flex flex-col text-left">
                <span className="text-[13.5px] font-medium">{a.title}</span>
                <span className="text-[12.5px] text-ink-2">{a.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {emailStatus.data?.configured &&
        (emailStatus.data.verified ? (
          <p className="text-[12.5px] text-ink-3">Email alerts go to {emailStatus.data.emailMasked}.</p>
        ) : (
          <form onSubmit={subscribe} className="flex gap-2">
            <label htmlFor="builder-email" className="sr-only">
              Email for alerts
            </label>
            <Input id="builder-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email me about new jobs" className="h-9 text-sm" />
            <Button type="submit" size="s" intent="secondary" busy={sending}>
              Confirm
            </Button>
          </form>
        ))}
      {message && <p className="text-[12.5px] text-ink-2">{message}</p>}
    </div>
  );
}

export function SignOutStudio() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      intent="ghost"
      size="s"
      busy={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/builders/session', { method: 'DELETE' }).catch(() => undefined);
        router.refresh();
      }}
    >
      Sign out of Studio
    </Button>
  );
}

/* ───────── Agents owned by the connected wallet (public data) ───────── */

type OwnedAgent = { chainId: number; tokenId: string; name: string; imageUrl: string | null; category: string; declaresProtocol: boolean; createdAt: string | null };

export function OwnedAgents() {
  const { address } = useActiveWallet();
  const owned = useQuery({
    queryKey: ['owned-agents', address],
    enabled: Boolean(address),
    queryFn: async () => {
      const r = await fetch(`/api/builders/agents?address=${address}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('The registry did not answer.');
      return (await r.json()) as { agents: OwnedAgent[] };
    },
  });
  if (!address) return <p className="text-[13px] text-ink-3">Connect the wallet that owns your agents to list them here.</p>;
  if (owned.isLoading) return <Skeleton className="h-24 w-full" />;
  if (owned.isError) return <Notice tone="watch">{(owned.error as Error).message}</Notice>;
  const agents = owned.data?.agents ?? [];
  if (agents.length === 0) return <p className="text-[13px] text-ink-3">{shortAddress(address)} owns no ERC-8004 agents on BNB Chain or testnet.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {agents.map((a) => (
        <li key={`${a.chainId}:${a.tokenId}`}>
          <Link href={`/studio/agents/${a.chainId}/${a.tokenId}`} className="flex items-center gap-3 rounded-[12px] border border-rule bg-raised p-3.5 transition-colors hover:border-rule-strong">
            <AgentAvatar name={a.name} imageUrl={a.imageUrl} seed={`${a.chainId}:${a.tokenId}`} size={40} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{a.name}</span>
              <span className="text-[12px] text-ink-3">
                #{a.tokenId} · {a.chainId === 56 ? 'BNB Chain' : 'testnet'} · {CATEGORY_BY_ID.get(a.category as Category)?.label ?? 'Unclassified'}
              </span>
            </span>
            {!a.declaresProtocol && <span className="text-[11.5px] text-watch">No endpoint</span>}
            <Icon.ChevronRight size={16} className="text-ink-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ───────── Drafts on this device ───────── */

export function DraftsList() {
  const drafts = useSyncExternalStore(subscribeToDrafts, draftsSnapshot, draftsServerSnapshot);
  if (drafts.length === 0) return null;
  return (
    <section aria-labelledby="drafts-title" className="flex flex-col gap-3">
      <h2 id="drafts-title" className="t-label">
        Unfinished on this device
      </h2>
      <ul className="ruled border-y border-rule">
        {drafts.map((d) => {
          const p = draftProgress(d.draft);
          return (
            <li key={d.id} className="flex items-center gap-4 py-3">
              <Link href={`/studio/new?draft=${encodeURIComponent(d.id)}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium hover:underline">{draftTitle(d.draft)}</p>
                <p className="text-[12px] text-ink-3">
                  {p.done} of {p.total} ready · edited {new Date(d.updatedAt).toLocaleDateString()}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => {
                  try {
                    const record = JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? '{}') as DraftRecord;
                    delete record[d.id];
                    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(record));
                    announceDraftsChanged();
                  } catch {
                    /* Nothing to remove. */
                  }
                }}
                className="text-[12.5px] text-ink-3 hover:text-bad"
              >
                Discard
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ───────── Connect an existing agent: diagnose, then verify ownership ───────── */

type Report = DiagnosticReport & { enrolled?: boolean; lifecycle?: BuilderLifecycle };

export function ImportAgent({ initial }: { initial?: { chainId: '56' | '97'; tokenId: string } }) {
  const router = useRouter();
  const passkey = usePasskeyWallet();
  const [chainId, setChainId] = useState<'56' | '97'>(initial?.chainId ?? '97');
  const [tokenId, setTokenId] = useState(initial?.tokenId ?? '');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<'idle' | 'connecting' | 'signing' | 'checking' | 'done'>('idle');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  async function diagnose(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const r = await fetch('/api/compatibility', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: Number(chainId), tokenId: tokenId.trim() }) });
      const body = (await r.json().catch(() => ({}))) as Report & { error?: string };
      if (r.status === 429) throw new Error('Too many checks from this connection. Wait a minute.');
      if (!r.ok) throw new Error(body.error ?? 'The check could not be completed.');
      setReport(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOwnership() {
    if (!report) return;
    setVerifyError(null);
    try {
      if (!hasIdentityWallet()) {
        throw new Error(passkey.wallet ? 'Proving ownership needs a message signature a passkey wallet cannot produce yet. Use the browser wallet that owns this identity.' : 'Open Pokter in a browser with the wallet that owns this identity.');
      }
      setVerify('connecting');
      const address = await connectIdentityWallet();
      if (!report.owner || getAddress(address) !== getAddress(report.owner)) throw new Error(`The connected wallet ${shortAddress(address)} is not this identity’s owner${report.owner ? ` (${shortAddress(report.owner)})` : ''}.`);
      const c = await fetch('/api/builders/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'challenge', chainId: report.chainId, tokenId: report.tokenId }) });
      const challenge = (await c.json()) as { challenge?: { id: string; message: string }; error?: string };
      if (!c.ok || !challenge.challenge) throw new Error(challenge.error ?? 'Could not prepare the ownership check.');
      setVerify('signing');
      const signature = await signIdentityMessage(address, challenge.challenge.message);
      setVerify('checking');
      const v = await fetch('/api/builders/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'verify', challengeId: challenge.challenge.id, signature }) });
      const verified = (await v.json()) as { publisher?: unknown; error?: string };
      if (!v.ok || !verified.publisher) throw new Error(verified.error ?? 'Ownership could not be verified.');
      setVerify('done');
      router.push(`/studio/agents/${report.chainId}/${report.tokenId}`);
      router.refresh();
    } catch (err) {
      const message = (err as Error).message;
      setVerifyError(/reject|denied|cancel/i.test(message) ? 'You declined the signature. Nothing was shared.' : message);
      setVerify('idle');
    }
  }

  const quality = report ? summarizeQuality(report.checks) : null;
  const steps = report?.lifecycle ? builderReadinessSteps(report.lifecycle) : [];
  const next = report?.lifecycle ? nextBuilderAction(report.lifecycle) : null;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={diagnose} className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Network</span>
          <Segmented label="Network" value={chainId} onChange={setChainId} options={[{ value: '97', label: 'Testnet' }, { value: '56', label: 'BNB Chain' }]} />
        </div>
        <Field label="ERC-8004 agent ID" className="flex-1">
          {(p) => <Input {...p} inputMode="numeric" value={tokenId} onChange={(e) => setTokenId(e.target.value.replace(/[^\d]/g, ''))} placeholder="e.g. 2554" className="t-readout" />}
        </Field>
        <Button type="submit" busy={busy} disabled={!tokenId}>
          Check it
        </Button>
      </form>
      {busy && (
        <ol className="flex flex-col gap-1.5 text-[13px] text-ink-3" role="status">
          <li>Reading the identity from the registry…</li>
          <li>Fetching its agent card and probing the endpoint…</li>
          <li>Asking for a signed quote…</li>
        </ol>
      )}
      {error && <Notice tone="bad" title="The check did not run">{error}</Notice>}

      {report && (
        <div className="anim-fade flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="t-h3">{report.name ?? `Agent #${report.tokenId}`}</h2>
              <p className="text-[13px] text-ink-3">
                Owner {report.owner ? shortAddress(report.owner) : 'unknown'} · checked {new Date(report.observedAt).toLocaleTimeString()}
              </p>
            </div>
            {quality && (
              <span className={cn('text-sm font-medium', quality.readiness === 'ready' ? 'text-ok' : quality.readiness === 'attention' ? 'text-watch' : 'text-bad')}>
                {quality.readiness === 'ready' ? 'Ready to list' : quality.readiness === 'attention' ? 'Listable, with gaps' : 'Not listable yet'}
              </span>
            )}
          </div>
          <ul className="ruled rounded-[14px] border border-rule bg-raised px-5">
            {report.checks.map((c) => (
              <li key={c.id} className="flex gap-3 py-3.5">
                <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', c.status === 'pass' ? 'bg-ok text-paper' : c.status === 'fail' ? 'bg-bad-wash text-bad' : 'bg-sunken text-ink-3')}>
                  {c.status === 'pass' ? <Icon.Check size={13} /> : c.status === 'fail' ? <Icon.Cross size={12} /> : <Icon.Dash size={12} />}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-[13px] text-ink-2">{c.detail}</span>
                  {c.remedy && <span className="text-[12.5px] text-ink-3">Fix: {c.remedy}</span>}
                </span>
              </li>
            ))}
          </ul>
          {steps.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="t-label">Path to first paid job</span>
              <ol className="grid gap-2 sm:grid-cols-5">
                {steps.map((s) => (
                  <li key={s.id} className={cn('rounded-[10px] border p-3 text-[12.5px]', s.done ? 'border-ok/40 bg-ok-wash/50' : 'border-rule')}>
                    <span className="flex items-center gap-1.5 font-medium">
                      {s.done ? <Icon.Check size={13} className="text-ok" /> : <Icon.Dash size={13} className="text-ink-3" />}
                      {s.label}
                    </span>
                    <span className="mt-1 block text-ink-3">{s.detail}</span>
                  </li>
                ))}
              </ol>
              {next && <p className="text-[13px] text-ink-2">Next: {next.action}</p>}
            </div>
          )}
          {report.enrolled && <Notice tone="ok">Its endpoint passed, so Pokter has added it to the probe schedule.</Notice>}
          <div className="flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5">
            <p className="text-sm font-medium">Manage it in Studio</p>
            <p className="text-[13px] text-ink-2">Prove you own it by signing a message with the owner wallet. A signature, not a transaction: no fee, nothing moves.</p>
            {verifyError && <Notice tone="watch">{verifyError}</Notice>}
            <Button onClick={() => void verifyOwnership()} busy={verify !== 'idle'} className="self-start">
              {verify === 'connecting' ? 'Connecting wallet' : verify === 'signing' ? 'Approve the signature' : verify === 'checking' ? 'Checking' : 'Verify ownership'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NoSession() {
  return (
    <EmptyState
      title="Verify ownership to manage this agent"
      action={
        <LinkButton href="/studio/import" size="s">
          Verify ownership
        </LinkButton>
      }
    >
      Studio shows jobs, deliveries and profile editing only to the wallet that owns the agent. Its public record is on its listing page.
    </EmptyState>
  );
}
