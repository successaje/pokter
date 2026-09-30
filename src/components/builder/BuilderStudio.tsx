'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getAddress } from 'viem';

import type { DiagnosticCheck, DiagnosticReport } from '@/lib/diagnostic/checks';
import { summarizeQuality } from '@/lib/builder/quality';
import { cn } from '@/lib/ui/cn';
import { connectIdentityWallet, hasIdentityWallet, signIdentityMessage } from '@/lib/registry/wallet';

type Mode = 'choose' | 'existing' | 'new';
type BuilderReport = DiagnosticReport & { enrolled?: boolean };

type Draft = {
  name: string;
  description: string;
  category: string;
  protocol: 'a2a' | 'mcp';
  endpoint: string;
  image: string;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  description: '',
  category: '',
  protocol: 'a2a',
  endpoint: '',
  image: '',
};

const DRAFT_KEY = 'pokter-agent-draft-v1';

function Icon({ name }: { name: 'registry' | 'spark' | 'check' | 'arrow' | 'wallet' }) {
  const className = 'size-5 fill-none stroke-current';
  if (name === 'registry') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="m4 7 8 4 8-4M12 11v10"/></svg>;
  if (name === 'spark') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></svg>;
  if (name === 'check') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="2"><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'wallet') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="M4 6.5h14a2 2 0 0 1 2 2v9H6a2 2 0 0 1-2-2v-9Z"/><path d="M4 7V5a2 2 0 0 1 2-2h11M16 12h4"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
}

function Address({ value }: { value: string | null }) {
  if (!value) return <span>Not published</span>;
  return <span className="mono">{value.slice(0, 6)}…{value.slice(-4)}</span>;
}

function StatusMark({ status }: { status: DiagnosticCheck['status'] }) {
  return (
    <span className={cn(
      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
      status === 'pass' && 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]',
      status === 'fail' && 'bg-[color:var(--caution-dim)] text-[color:var(--caution)]',
      status === 'unknown' && 'bg-[color:var(--bg-subtle)] text-[color:var(--text-muted)]',
    )}>
      {status === 'pass' ? '✓' : status === 'fail' ? '!' : '–'}
    </span>
  );
}

export function BuilderStudio() {
  const [mode, setMode] = useState<Mode>('choose');
  const [tokenId, setTokenId] = useState('');
  const [chainId, setChainId] = useState('56');
  const [report, setReport] = useState<BuilderReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState<'idle' | 'registry' | 'signature' | 'verifying'>('idle');
  const [draft, setDraft] = useState<Draft>(() => {
    if (typeof window === 'undefined') return EMPTY_DRAFT;
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      return stored ? { ...EMPTY_DRAFT, ...JSON.parse(stored) } : EMPTY_DRAFT;
    } catch {
      // A draft is a convenience. Storage being unavailable must not block the flow.
      return EMPTY_DRAFT;
    }
  });
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
  }, [draft]);

  const quality = useMemo(
    () => (report ? summarizeQuality(report.checks) : null),
    [report],
  );
  const ownsAgent = useMemo(() => {
    if (!connected || !report?.owner) return null;
    try { return getAddress(connected) === getAddress(report.owner); } catch { return false; }
  }, [connected, report]);

  const draftChecks = [
    { label: 'Clear name', done: draft.name.trim().length >= 3 },
    { label: 'Outcome-led description', done: draft.description.trim().length >= 40 },
    { label: 'Marketplace category', done: Boolean(draft.category) },
    { label: 'Secure service endpoint', done: /^https:\/\//i.test(draft.endpoint.trim()) },
    { label: 'Public agent image', done: /^https:\/\//i.test(draft.image.trim()) },
  ];
  const draftScore = draftChecks.filter((check) => check.done).length;
  const registrationPreview = useMemo(() => ({
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: draft.name.trim(),
    description: draft.description.trim(),
    image: draft.image.trim(),
    services: [{
      name: draft.protocol.toUpperCase(),
      endpoint: draft.endpoint.trim(),
    }],
    x402Support: false,
    active: true,
    supportedTrust: ['reputation'],
  }), [draft]);

  async function runDiagnostic(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setReport(null); setConnected(null); setVerifiedAt(null);
    try {
      const response = await fetch('/api/compatibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: Number(chainId), tokenId: tokenId.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The check could not be completed.');
      setReport(payload as BuilderReport);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The check could not be completed.');
    } finally { setBusy(false); }
  }

  async function verifyOwner() {
    setError(null); setVerifiedAt(null); setVerificationStep('registry');
    try {
      if (!hasIdentityWallet()) throw new Error('Install or open an injected wallet to verify ownership.');
      if (!report) throw new Error('Find the ERC-8004 identity first.');
      const address = await connectIdentityWallet();
      setConnected(address);
      if (!report.owner || getAddress(address) !== getAddress(report.owner)) {
        throw new Error('The connected wallet is not the current ERC-8004 owner.');
      }
      const challengeResponse = await fetch('/api/builders/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'challenge', chainId: report.chainId, tokenId: report.tokenId }),
      });
      const challengePayload = await challengeResponse.json() as { challenge?: { id: string; message: string }; error?: string };
      if (!challengeResponse.ok || !challengePayload.challenge) throw new Error(challengePayload.error ?? 'Could not prepare ownership verification.');
      setVerificationStep('signature');
      const signature = await signIdentityMessage(address, challengePayload.challenge.message);
      setVerificationStep('verifying');
      const verifyResponse = await fetch('/api/builders/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'verify', challengeId: challengePayload.challenge.id, signature }),
      });
      const verifyPayload = await verifyResponse.json() as { publisher?: { verifiedAt: string }; error?: string };
      if (!verifyResponse.ok || !verifyPayload.publisher) throw new Error(verifyPayload.error ?? 'Ownership verification failed.');
      setVerifiedAt(verifyPayload.publisher.verifiedAt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The wallet could not be connected.');
    } finally { setVerificationStep('idle'); }
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setReviewing(false);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16 pt-6 sm:gap-10 sm:pt-10">
      <header className="grid items-end gap-6 border-b border-[color:var(--border)] pb-7 lg:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <p className="mono mb-3 text-[10px] uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">Builder studio</p>
          <h1 className="font-[family-name:var(--font-serif)] text-4xl leading-[1.02] tracking-tight sm:text-5xl">Bring a quality agent to BNB Chain.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[color:var(--text-secondary)]">Prepare an agent, verify what buyers will see, and start building a measurable track record. No listing fee and no private review queue.</p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-[11px] text-[color:var(--text-muted)]">
          <span className="size-2 rounded-full bg-[color:var(--positive)]" />
          Registry checks are read-only
        </div>
      </header>

      {mode === 'choose' && (
        <section aria-labelledby="path-title" className="flex flex-col gap-5">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Start here</p>
            <h2 id="path-title" className="mt-2 text-xl font-semibold">Where is your agent today?</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <button type="button" onClick={() => setMode('existing')} className="group flex min-h-56 flex-col items-start rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-6 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--brand)] hover:shadow-[0_16px_48px_var(--brand-shadow)]">
              <span className="flex size-11 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]"><Icon name="registry" /></span>
              <span className="mt-8 text-lg font-semibold">I already have an ERC-8004 agent</span>
              <span className="mt-2 max-w-sm text-[13px] leading-5 text-[color:var(--text-secondary)]">Verify ownership, test the published endpoint and add it to Pokter’s measurement roster.</span>
              <span className="mt-auto flex items-center gap-2 pt-6 text-[12px] font-semibold text-[color:var(--brand-strong)]">Check my agent <Icon name="arrow" /></span>
            </button>
            <button type="button" onClick={() => setMode('new')} className="group flex min-h-56 flex-col items-start rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-6 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--brand)] hover:shadow-[0_16px_48px_var(--brand-shadow)]">
              <span className="flex size-11 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]"><Icon name="spark" /></span>
              <span className="mt-8 text-lg font-semibold">I’m preparing a new agent</span>
              <span className="mt-2 max-w-sm text-[13px] leading-5 text-[color:var(--text-secondary)]">Build a complete public profile and catch quality gaps before registration.</span>
              <span className="mt-auto flex items-center gap-2 pt-6 text-[12px] font-semibold text-[color:var(--brand-strong)]">Create a draft <Icon name="arrow" /></span>
            </button>
          </div>
          <p className="text-[11px] leading-5 text-[color:var(--text-muted)]">Pokter discovers public ERC-8004 identities. Listing does not endorse an agent; reliability and reputation are measured separately.</p>
        </section>
      )}

      {mode !== 'choose' && (
        <button type="button" onClick={() => { setMode('choose'); setError(null); }} className="flex w-fit items-center gap-2 text-[12px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
          <span aria-hidden>←</span> Change path
        </button>
      )}

      {mode === 'existing' && (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-7">
            <div className="flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-[color:var(--brand)] text-[12px] font-bold text-[color:var(--brand-ink)]">1</span><div><h2 className="font-semibold">Find your identity</h2><p className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">No signature or transaction required</p></div></div>
            <form onSubmit={runDiagnostic} className="mt-6 grid gap-4 sm:grid-cols-[1fr_170px_auto] sm:items-end">
              <label className="flex flex-col gap-2"><span className="text-[11px] font-medium">ERC-8004 agent ID</span><input value={tokenId} onChange={(event) => setTokenId(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="265375" className="mono h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-sm outline-none focus:border-[color:var(--border-focus)]" /></label>
              <label className="flex flex-col gap-2"><span className="text-[11px] font-medium">Identity network</span><select value={chainId} onChange={(event) => setChainId(event.target.value)} className="h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px] outline-none focus:border-[color:var(--border-focus)]"><option value="56">BNB Chain</option><option value="97">BNB Testnet</option></select></label>
              <button disabled={busy || !tokenId} className="action-primary h-11 rounded-[var(--radius)] px-5 text-[12px] font-semibold disabled:opacity-50">{busy ? 'Checking…' : 'Check agent'}</button>
            </form>
            {busy && <div className="mt-5 flex items-center gap-3 rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-3 text-[12px] text-[color:var(--text-secondary)]"><span className="size-4 animate-spin rounded-full border-2 border-[color:var(--border-strong)] border-t-[color:var(--brand)]" />Calling the published endpoint and requesting a read-only quote…</div>}
            {error && <p role="alert" className="mt-5 rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[12px] text-[color:var(--caution)]">{error}</p>}

            {report && quality && (
              <div className="mt-8 flex flex-col gap-6 border-t border-[color:var(--border)] pt-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Identity found</p><h3 className="mt-1 font-[family-name:var(--font-serif)] text-2xl">{report.name ?? `Agent #${report.tokenId}`}</h3><Link href={`/agents/${report.chainId}/${report.tokenId}`} className="mt-2 inline-flex text-[11px] text-[color:var(--info)] hover:underline">View public profile ↗</Link></div>
                  <div className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] px-4 py-3 text-right"><p className="text-2xl font-semibold">{quality.score}%</p><p className="text-[10px] text-[color:var(--text-muted)]">checks observed</p></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-[var(--radius)] border border-[color:var(--border)] p-3"><p className="text-[10px] text-[color:var(--text-muted)]">Identity owner</p><p className="mt-1 text-[12px]"><Address value={report.owner} /></p></div><div className="rounded-[var(--radius)] border border-[color:var(--border)] p-3"><p className="text-[10px] text-[color:var(--text-muted)]">Agent signing wallet</p><p className="mt-1 text-[12px]"><Address value={report.agentWallet} /></p></div></div>
                <div><div className="mb-3 flex items-center justify-between"><h3 className="text-[13px] font-semibold">Marketplace readiness</h3><span className="text-[11px] text-[color:var(--text-muted)]">{quality.passed} passed · {quality.failed} need attention · {quality.unknown} unverified</span></div><ul className="grid gap-2">{report.checks.map((check) => <li key={check.id} className="flex gap-3 rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-3"><StatusMark status={check.status}/><div><p className="text-[12px] font-medium">{check.label}</p><p className="mt-1 text-[11px] leading-5 text-[color:var(--text-secondary)]">{check.detail}</p>{check.remedy && check.status !== 'pass' && <details className="mt-2 text-[11px] text-[color:var(--text-muted)]"><summary className="cursor-pointer font-medium text-[color:var(--brand-strong)]">How to improve</summary><p className="mt-1 leading-5">{check.remedy}</p></details>}</div></li>)}</ul></div>
              </div>
            )}
          </div>

          <aside className="h-fit rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5 lg:sticky lg:top-20">
            <p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Publish checklist</p>
            <ol className="mt-5 flex flex-col gap-5">{['Find the registry identity','Verify the owner wallet','Fix quality gaps','Build an independent record'].map((label, index) => <li key={label} className="flex gap-3"><span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px]', (index === 0 && report) || (index === 1 && ownsAgent) ? 'border-[color:var(--positive)] bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : 'border-[color:var(--border-strong)] text-[color:var(--text-muted)]')}>{(index === 0 && report) || (index === 1 && ownsAgent) ? '✓' : index + 1}</span><span className="pt-0.5 text-[12px]">{label}</span></li>)}</ol>
            {report && <div className="mt-6 border-t border-[color:var(--border)] pt-5"><button type="button" disabled={verificationStep !== 'idle' || Boolean(verifiedAt)} onClick={verifyOwner} className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 py-3 text-[12px] font-semibold hover:border-[color:var(--brand)] disabled:opacity-60"><Icon name={verifiedAt ? 'check' : 'wallet'} />{verifiedAt ? 'Publisher verified' : verificationStep === 'registry' ? 'Checking registry owner…' : verificationStep === 'signature' ? 'Waiting for wallet signature…' : verificationStep === 'verifying' ? 'Verifying signature…' : 'Verify ownership'}</button>{verifiedAt && <p className="mt-3 text-[11px] leading-5 text-[color:var(--positive)]">Ownership verified with an expiring, single-use wallet challenge.</p>}{!verifiedAt && ownsAgent === true && <p className="mt-3 text-[11px] leading-5 text-[color:var(--text-secondary)]">Address matched. Sign the verification message to prove control.</p>}{ownsAgent === false && <p className="mt-3 text-[11px] leading-5 text-[color:var(--caution)]">This wallet does not own the identity. Switch accounts if you manage it.</p>}<p className="mt-3 text-[10px] leading-4 text-[color:var(--text-muted)]">The message names this identity and expires after ten minutes. It cannot move funds or authorize transactions.</p></div>}
          </aside>
        </section>
      )}

      {mode === 'new' && (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-7">
            <div className="flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-[color:var(--brand)] text-[12px] font-bold text-[color:var(--brand-ink)]">1</span><div><h2 className="font-semibold">Shape the public profile</h2><p className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">Saved privately on this device</p></div></div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <label className="flex flex-col gap-2"><span className="text-[11px] font-medium">Agent name</span><input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="Treasury Sentinel" className="h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-sm outline-none focus:border-[color:var(--border-focus)]" /></label>
              <label className="flex flex-col gap-2"><span className="text-[11px] font-medium">Primary outcome</span><select value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} className="h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px] outline-none focus:border-[color:var(--border-focus)]"><option value="">Choose a category</option><option value="yield">Earn yield</option><option value="risk">Monitor risk</option><option value="execution">Execute strategies</option><option value="research">Research markets</option></select></label>
              <label className="flex flex-col gap-2 sm:col-span-2"><span className="text-[11px] font-medium">What does it deliver?</span><textarea value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} rows={4} placeholder="Explain the buyer’s outcome, the inputs required and the limits. Avoid slogans." className="resize-none rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-3 text-sm leading-6 outline-none focus:border-[color:var(--border-focus)]"/><span className="text-right text-[10px] text-[color:var(--text-muted)]">{draft.description.trim().length}/40 recommended minimum</span></label>
              <label className="flex flex-col gap-2"><span className="text-[11px] font-medium">Service protocol</span><select value={draft.protocol} onChange={(event) => updateDraft('protocol', event.target.value as Draft['protocol'])} className="h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px] outline-none focus:border-[color:var(--border-focus)]"><option value="a2a">A2A</option><option value="mcp">MCP</option></select></label>
              <label className="flex flex-col gap-2"><span className="text-[11px] font-medium">HTTPS endpoint</span><input value={draft.endpoint} onChange={(event) => updateDraft('endpoint', event.target.value)} placeholder="https://agent.example/a2a" className="h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-sm outline-none focus:border-[color:var(--border-focus)]" /></label>
              <label className="flex flex-col gap-2 sm:col-span-2"><span className="text-[11px] font-medium">Agent image URL</span><input value={draft.image} onChange={(event) => updateDraft('image', event.target.value)} placeholder="https://agent.example/avatar.png" className="h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-sm outline-none focus:border-[color:var(--border-focus)]" /></label>
            </div>
            <div className="mt-7 rounded-[var(--radius)] border border-[color:var(--caution)]/30 bg-[color:var(--caution-dim)] p-4"><p className="text-[12px] font-semibold text-[color:var(--caution)]">Registration is intentionally not live yet</p><p className="mt-1 text-[11px] leading-5 text-[color:var(--text-secondary)]">This prepares and validates your public profile without creating a mainnet transaction. Registration will be enabled only after the contract path and recovery flow pass protocol review.</p></div>
            {reviewing && (
              <div className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--positive)] text-white"><Icon name="check" /></span>
                  <div>
                    <h3 className="text-sm font-semibold">Registration file ready for review</h3>
                    <p className="mt-1 text-[11px] leading-5 text-[color:var(--text-secondary)]">This is the exact public profile shape Pokter is preparing. It still needs an onchain identity ID before it can be published.</p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-4 border-t border-[color:var(--positive)]/20 pt-5 sm:grid-cols-2">
                  <div><dt className="text-[10px] text-[color:var(--text-muted)]">Agent</dt><dd className="mt-1 text-[12px] font-medium">{registrationPreview.name}</dd></div>
                  <div><dt className="text-[10px] text-[color:var(--text-muted)]">Service</dt><dd className="mt-1 text-[12px] font-medium">{registrationPreview.services[0].name} · HTTPS</dd></div>
                  <div className="sm:col-span-2"><dt className="text-[10px] text-[color:var(--text-muted)]">Public endpoint</dt><dd className="mono mt-1 break-all text-[11px]">{registrationPreview.services[0].endpoint}</dd></div>
                </dl>
                <details className="mt-5 border-t border-[color:var(--positive)]/20 pt-4">
                  <summary className="cursor-pointer text-[11px] font-semibold">Inspect registration JSON</summary>
                  <pre className="mono mt-3 max-h-64 overflow-auto rounded-[var(--radius)] bg-[color:var(--bg)] p-3 text-[10px] leading-5 text-[color:var(--text-secondary)]">{JSON.stringify(registrationPreview, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
          <aside className="h-fit rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5 lg:sticky lg:top-20">
            <div className="flex items-end justify-between"><div><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Draft quality</p><p className="mt-2 text-3xl font-semibold">{draftScore}/5</p></div><span className="text-[10px] text-[color:var(--text-muted)]">Auto-saved</span></div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface)]"><div className="h-full rounded-full bg-[color:var(--brand)] transition-all" style={{ width: `${draftScore * 20}%` }} /></div>
            <ul className="mt-5 flex flex-col gap-3">{draftChecks.map((check) => <li key={check.label} className="flex items-center gap-3 text-[12px]"><span className={cn('flex size-5 items-center justify-center rounded-full border text-[10px]', check.done ? 'border-[color:var(--positive)] bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : 'border-[color:var(--border-strong)] text-[color:var(--text-muted)]')}>{check.done ? '✓' : '·'}</span>{check.label}</li>)}</ul>
            <button type="button" disabled={draftScore < 5} onClick={() => setReviewing(true)} className="action-primary mt-6 w-full rounded-[var(--radius)] px-4 py-3 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">{reviewing ? 'Registration file ready' : 'Review registration file'}</button>
            <p className="mt-3 text-[10px] leading-4 text-[color:var(--text-muted)]">Review generates a standards-aligned preview only. It cannot sign or publish.</p>
          </aside>
        </section>
      )}
    </div>
  );
}
