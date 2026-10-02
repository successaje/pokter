'use client';

import { formatUnits, getAddress } from 'viem';
import { useState } from 'react';
import { useAccount, useConnect, useSignMessage, useSwitchChain } from 'wagmi';

import type { HiredJob } from '@/lib/erc8183/types';
import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { submitExternalDeliverable } from '@/lib/wallet/external';

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function statusTone(status: HiredJob['status']) {
  if (status === 'COMPLETED') return 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]';
  if (status === 'REJECTED' || status === 'EXPIRED') return 'bg-[color:var(--negative-dim)] text-[color:var(--negative)]';
  return 'bg-[color:var(--caution-dim)] text-[color:var(--caution)]';
}

function jobInstruction(job: HiredJob) {
  if (job.status === 'FUNDED') return 'Ready for the provider to deliver';
  if (job.status === 'SUBMITTED') return 'Delivered · buyer review in progress';
  if (job.status === 'COMPLETED') return 'Completed and released';
  if (job.status === 'EXPIRED') return 'Expired before delivery';
  if (job.status === 'REJECTED') return 'Delivery contested';
  return 'Waiting for escrow funding';
}

function DeliveryComposer({ job, account }: { job: HiredJob; account: `0x${string}` }) {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'authorizing' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { signMessageAsync } = useSignMessage();

  async function deliver() {
    if (content.trim().length < 3 || status !== 'idle') return;
    setError(null);
    try {
      setStatus('authorizing');
      const challengeResponse = await fetch('/api/builders/deliveries', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'challenge', jobId: job.jobId }),
      });
      const challenge = await challengeResponse.json() as { challengeId?: string; message?: string; error?: string };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message) throw new Error(challenge.error ?? 'Could not authorize this delivery.');
      const signature = await signMessageAsync({ message: challenge.message, account });
      const prepareResponse = await fetch('/api/builders/deliveries', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'prepare', jobId: job.jobId, challengeId: challenge.challengeId, signature, content: content.trim() }),
      });
      const prepared = await prepareResponse.json() as { deliverable?: `0x${string}`; deliverableUrl?: string; error?: string };
      if (!prepareResponse.ok || !prepared.deliverable || !prepared.deliverableUrl) throw new Error(prepared.error ?? 'Could not prepare the immutable delivery manifest.');
      setStatus('submitting');
      const transactionHash = await submitExternalDeliverable({
        account, jobId: BigInt(job.jobId), deliverable: prepared.deliverable, deliverableUrl: prepared.deliverableUrl,
      });
      const confirmResponse = await fetch('/api/builders/deliveries', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', jobId: job.jobId, transactionHash }),
      });
      const confirmed = await confirmResponse.json() as { error?: string };
      if (!confirmResponse.ok) throw new Error(confirmed.error ?? 'The transaction succeeded but the index refresh failed.');
      setStatus('done');
    } catch (cause) {
      setStatus('idle');
      const message = cause instanceof Error ? cause.message : 'Delivery did not complete.';
      setError(/rejected|denied|cancel/i.test(message) ? 'Signature or transaction cancelled. Nothing was submitted.' : message);
    }
  }

  if (status === 'done') return <div className="rounded-[var(--radius)] bg-[color:var(--positive-dim)] px-3 py-2.5 text-[10px] font-medium text-[color:var(--positive)]">Delivery submitted and verified onchain. Refresh to see buyer-review status.</div>;
  return (
    <div className="mt-3 space-y-2">
      <label className="block text-[9px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]" htmlFor={`delivery-${job.jobId}`}>Deliverable</label>
      <textarea id={`delivery-${job.jobId}`} value={content} onChange={(event) => setContent(event.target.value)} maxLength={20_000} rows={4} placeholder="Give the buyer the completed result, relevant links, assumptions and limitations." className="w-full resize-y rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 py-2.5 text-[12px] leading-5 outline-none focus:border-[color:var(--brand)]" />
      <div className="flex items-center justify-between gap-3"><span className="text-[8px] text-[color:var(--text-faint)]">{content.length.toLocaleString()} / 20,000</span><button type="button" onClick={deliver} disabled={content.trim().length < 3 || status !== 'idle'} className="rounded-[var(--radius)] bg-[color:var(--brand)] px-3 py-2 text-[10px] font-semibold text-[color:var(--brand-ink)] disabled:cursor-not-allowed disabled:opacity-45">{status === 'authorizing' ? 'Authorize in wallet…' : status === 'submitting' ? 'Submit onchain…' : 'Review and submit'}</button></div>
      {error && <p role="alert" className="rounded-[var(--radius)] bg-[color:var(--negative-dim)] px-3 py-2 text-[9px] leading-4 text-[color:var(--negative)]">{error}</p>}
      <p className="text-[8px] leading-4 text-[color:var(--text-faint)]">Pokter stores the exact manifest bytes first. Your provider wallet then commits their hash and public URL to escrow.</p>
    </div>
  );
}

export function BuilderJobInbox({ jobs, owner }: { jobs: HiredJob[]; owner: string }) {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const connected = address ? getAddress(address) : null;
  const wrongChain = Boolean(isConnected && chain?.id !== ESCROW_CHAIN.id);
  const funded = jobs.filter((job) => job.status === 'FUNDED');
  const submitted = jobs.filter((job) => job.status === 'SUBMITTED');
  const remaining = jobs.filter((job) => !['FUNDED', 'SUBMITTED'].includes(job.status));
  const ordered = [...funded, ...submitted, ...remaining];

  return (
    <section id="jobs" className="scroll-mt-24 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Work queue</p>
          <h2 className="mt-2 text-base font-semibold">Agent commissions</h2>
          <p className="mt-1 text-[12px] leading-4 text-[color:var(--text-muted)]">Funded work first, followed by deliveries awaiting buyer review.</p>
        </div>
        {funded.length > 0 && <span className="shrink-0 rounded-full bg-[color:var(--caution-dim)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--caution)]">{funded.length} to deliver</span>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-3"><p className="text-lg font-semibold">{funded.length}</p><p className="text-[9px] uppercase tracking-wide text-[color:var(--text-muted)]">Funded</p></div>
        <div className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-3"><p className="text-lg font-semibold">{submitted.length}</p><p className="text-[9px] uppercase tracking-wide text-[color:var(--text-muted)]">In review</p></div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {ordered.slice(0, 8).map((job) => {
          const providerMatches = connected?.toLowerCase() === job.provider.toLowerCase();
          return (
            <article key={job.id} className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-[12px] font-semibold">{job.agentName}</p><p className="mt-1 text-[9px] text-[color:var(--text-muted)]">Job #{job.jobId} · {Number(formatUnits(BigInt(job.budgetRaw), 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} $U</p></div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold ${statusTone(job.status)}`}>{job.status}</span>
              </div>
              <p className="mt-3 text-[10px] font-medium text-[color:var(--text-secondary)]">{jobInstruction(job)}</p>
              {job.status === 'FUNDED' && (
                <div className="mt-3 border-t border-[color:var(--border)] pt-3">
                  {providerMatches && !wrongChain ? (
                    <><div className="flex items-center gap-2 text-[10px] text-[color:var(--positive)]"><span className="size-1.5 rounded-full bg-current" />Provider wallet ready</div><DeliveryComposer job={job} account={connected!} /></>
                  ) : wrongChain ? (
                    <button type="button" onClick={() => switchChain({ chainId: ESCROW_CHAIN.id })} disabled={switching} className="w-full rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-2 text-[10px] font-semibold hover:bg-[color:var(--surface-hover)] disabled:opacity-50">{switching ? 'Switching…' : `Switch to ${ESCROW_CHAIN.name}`}</button>
                  ) : !connected ? (
                    <button type="button" onClick={() => connectors[0] && connect({ connector: connectors[0] })} disabled={isPending || !connectors[0]} className="w-full rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-2 text-[10px] font-semibold hover:bg-[color:var(--surface-hover)] disabled:opacity-50">{isPending ? 'Waiting for wallet…' : 'Connect provider wallet'}</button>
                  ) : (
                    <div className="rounded-[var(--radius)] bg-[color:var(--caution-dim)] px-3 py-2.5 text-[9px] leading-4 text-[color:var(--caution)]">Connected {short(connected)}. This job requires provider {short(job.provider)}.</div>
                  )}
                  <p className="mt-2 text-[9px] leading-4 text-[color:var(--text-muted)]">Identity owner: {short(owner)} · Provider: {short(job.provider)}</p>
                </div>
              )}
            </article>
          );
        })}
        {!ordered.length && <div className="rounded-[var(--radius)] border border-dashed border-[color:var(--border-strong)] px-4 py-7 text-center"><p className="text-[11px] font-medium">No commissioned work yet</p><p className="mt-1 text-[9px] leading-4 text-[color:var(--text-muted)]">Jobs appear after a buyer funds escrow for one of your agents.</p></div>}
      </div>

      <p className="mt-4 border-t border-[color:var(--border)] pt-4 text-[9px] leading-4 text-[color:var(--text-muted)]">Owning an ERC-8004 identity does not grant access to its escrow. Delivery requires the exact provider wallet recorded on the job.</p>
    </section>
  );
}
