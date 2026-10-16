'use client';

import { useState } from 'react';
import { formatUnits, getAddress } from 'viem';
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi';

import type { HiredJob } from '@/lib/erc8183/types';
import { chainLabel } from '@/lib/network/presentation';
import { submitExternalDeliverable, transactionExists } from '@/lib/wallet/external';
import { shortAddress } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Button } from '@/ui/Button';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Textarea } from '@/ui/Field';
import { PAYMENT_TERMS } from '@/lib/erc8183/payment-terms';

const STATUS: Record<HiredJob['status'], { label: string; tone: string }> = {
  OPEN: { label: 'Not funded', tone: 'text-ink-3' },
  FUNDED: { label: 'To deliver', tone: 'text-watch' },
  SUBMITTED: { label: 'Buyer reviewing', tone: 'text-info' },
  COMPLETED: { label: 'Paid', tone: 'text-ok' },
  REJECTED: { label: 'Disputed', tone: 'text-bad' },
  EXPIRED: { label: 'Expired undelivered', tone: 'text-ink-3' },
};

const STAGES = { authorizing: 'Sign to authorise this delivery', storing: 'Storing the exact file', submitting: 'Approve the on-chain submission', confirming: 'Confirming on chain' } as const;

/**
 * Deliver a funded job by hand. The order matters and is enforced by the
 * API: the provider wallet signs a challenge, Pokter stores the exact bytes
 * and hashes them, the provider commits that hash on chain, and the index
 * checks the transaction. Nothing is marked delivered on a promise.
 */
function Composer({ job, account }: { job: HiredJob; account: `0x${string}` }) {
  const [content, setContent] = useState('');
  const [stage, setStage] = useState<keyof typeof STAGES | 'idle' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Once the submission is on chain it must never be sent again; only the
  // index confirmation is retried.
  // Testnet keys predate other escrows and stay as they were.
  const storeKey = `pokter.delivery-submitted.${job.chainId === 97 ? job.jobId : `${job.chainId}:${job.jobId}`}`;
  const [submittedTx, setSubmittedTxState] = useState<`0x${string}` | null>(() => {
    try {
      return (window.sessionStorage.getItem(storeKey) as `0x${string}` | null) ?? null;
    } catch {
      return null;
    }
  });
  const clearSubmittedTx = () => {
    setSubmittedTxState(null);
    try {
      window.sessionStorage.removeItem(storeKey);
    } catch {
      /* Then it clears on the next tab. */
    }
  };
  const setSubmittedTx = (hash: `0x${string}`) => {
    setSubmittedTxState(hash);
    try {
      window.sessionStorage.setItem(storeKey, hash);
    } catch {
      /* Kept in memory only. */
    }
  };
  const { signMessageAsync } = useSignMessage();

  const post = async (body: unknown) => {
      const r = await fetch('/api/builders/deliveries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const payload = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
      if (!r.ok) throw new Error(payload.error ?? 'The delivery service refused this step.');
      return payload;
  };

  async function confirm(transactionHash: `0x${string}`) {
    setStage('confirming');
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await post({ action: 'confirm', chainId: job.chainId, jobId: job.jobId, transactionHash });
        try {
          window.sessionStorage.removeItem(storeKey);
        } catch {
          /* Nothing stored. */
        }
        setStage('done');
        return;
      } catch (cause) {
        lastError = cause as Error;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      }
    }
    setStage('idle');
    setError(`Your delivery is on chain, but Pokter's index has not seen it yet (${lastError?.message ?? 'no detail'}). Confirm again in a minute; nothing will be resubmitted.`);
  }

  async function deliver() {
    setError(null);
    if (submittedTx) {
      /*
       * Remembered, then checked.
       *
       * The hash is kept so a submission is never sent twice, which was
       * right about every case except the one that happened: a wallet
       * returned a hash for a transaction that never reached the
       * network. The chain had no record, the job stayed funded, and
       * re-confirming could never succeed — so the seller could not
       * deliver at all without clearing their own session storage.
       *
       * If the chain has never heard of it, there is nothing to
       * confirm and nothing in flight, so the delivery starts again.
       */
      if (await transactionExists(job.chainId, submittedTx)) return confirm(submittedTx);
      clearSubmittedTx();
      setError('The wallet reported a transaction the network never received, so nothing was delivered. Sign and deliver again — no second submission can land, because the escrow refuses one once a delivery is in.');
      return;
    }
    try {
      setStage('authorizing');
      const challenge = (await post({ action: 'challenge', chainId: job.chainId, jobId: job.jobId })) as { challengeId: string; message: string };
      const signature = await signMessageAsync({ message: challenge.message, account });
      setStage('storing');
      const prepared = (await post({ action: 'prepare', chainId: job.chainId, jobId: job.jobId, challengeId: challenge.challengeId, signature, content: content.trim() })) as { deliverable: `0x${string}`; deliverableUrl: string };
      setStage('submitting');
      const transactionHash = await submitExternalDeliverable({ account, chainId: job.chainId, jobId: BigInt(job.jobId), deliverable: prepared.deliverable, deliverableUrl: prepared.deliverableUrl });
      setSubmittedTx(transactionHash);
      await confirm(transactionHash);
      return;
    } catch (cause) {
      const message = (cause as Error).message ?? 'Delivery did not complete.';
      setError(/rejected|denied|cancel/i.test(message) ? 'Cancelled in the wallet. Nothing was submitted.' : message);
      setStage('idle');
    }
  }

  if (stage === 'done') return <Notice tone="ok" title="Delivered">Committed on chain. {PAYMENT_TERMS.sellerAfterSubmit}</Notice>;
  const busy = stage !== 'idle';
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`d-${job.jobId}`} className="text-[13px] font-medium">
        Deliverable
      </label>
      <Textarea id={`d-${job.jobId}`} value={content} onChange={(e) => setContent(e.target.value)} maxLength={20_000} placeholder="The completed result, with sources, assumptions and limitations." disabled={busy} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="t-readout text-[12px] text-ink-3">{content.length.toLocaleString()} / 20,000</span>
        <Button size="s" onClick={() => void deliver()} busy={busy} disabled={!submittedTx && content.trim().length < 3}>
          {busy ? STAGES[stage as keyof typeof STAGES] : submittedTx ? 'Confirm delivery' : 'Sign and deliver'}
        </Button>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}

export function DeliveryInbox({ jobs }: { jobs: HiredJob[] }) {
  const { address, isConnected, chain } = useAccount();
  const { openConnect } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState<string | null>(null);
  const connected = address ? getAddress(address) : null;
  // Each job is delivered on the escrow it was funded on.
  const wrongChainFor = (job: HiredJob) => Boolean(isConnected && chain?.id !== job.chainId);
  const order = (j: HiredJob) => (j.status === 'FUNDED' ? 0 : j.status === 'SUBMITTED' ? 1 : 2);
  const ordered = [...jobs].sort((a, b) => order(a) - order(b));

  if (ordered.length === 0) {
    return <EmptyState title="No commissioned work yet">Jobs appear here when a buyer funds escrow for one of your agents. Agents with a live delivery endpoint receive them automatically.</EmptyState>;
  }
  return (
    <ul className="ruled border-y border-rule">
      {ordered.slice(0, 20).map((job) => {
        const s = STATUS[job.status];
        const isProvider = connected?.toLowerCase() === job.provider.toLowerCase();
        const wrongChain = wrongChainFor(job);
        return (
          <li key={job.id} className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {job.agentName} <span className="t-readout font-normal text-ink-3">#{job.jobId}</span>
                </p>
                <p className="line-clamp-2 text-[13px] text-ink-2">{job.task}</p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className={cn('text-[13px] font-medium', s.tone)}>{s.label}</span>
                <span className="t-readout text-[12.5px] text-ink-3">{Number(formatUnits(BigInt(job.budgetRaw), 18)).toLocaleString('en-US', { maximumFractionDigits: 4 })} $U</span>
              </div>
            </div>
            {job.status === 'FUNDED' &&
              (open === job.id ? (
                isProvider && !wrongChain ? (
                  <Composer job={job} account={connected!} />
                ) : wrongChain ? (
                  <Button size="s" intent="secondary" onClick={() => switchChain({ chainId: job.chainId === 56 ? 56 : 97 })} busy={switching} className="self-start">
                    Switch to {chainLabel(job.chainId)}
                  </Button>
                ) : !connected ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[13px] text-ink-2">Delivering is signed by the provider wallet {shortAddress(job.provider)}, in a browser wallet.</p>
                    <Button size="s" intent="secondary" onClick={() => openConnect('to deliver as the provider')} className="self-start">
                      Connect provider wallet
                    </Button>
                  </div>
                ) : (
                  <Notice tone="watch">Connected {shortAddress(connected)}, but this job pays provider {shortAddress(job.provider)}. Switch accounts in your wallet.</Notice>
                )
              ) : (
                <Button size="s" intent="secondary" onClick={() => setOpen(job.id)} className="self-start">
                  Deliver by hand
                </Button>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
