'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAddress } from 'viem';
import { useAccount } from 'wagmi';

import { jobAmountLabel, jobToken } from '@/lib/erc8183/job-amount';
import type { HiredJob } from '@/lib/erc8183/types';
import { displaySymbol, paymentTokenAt } from '@/lib/network/tokens';
import { chainLabel } from '@/lib/network/presentation';
import { jobHref } from '@/lib/jobs/href';
import { readDisputeState, readReviewTiming, settleFromExternalWallet, submitExternalDeliverable, transactionExists } from '@/lib/wallet/external';
import { sellerReleaseSummary } from '@/lib/erc8183/settle-window';
import { useClockThrough } from '@/lib/ui/use-moment';
import { shortAddress } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Button } from '@/ui/Button';
import { TxLink } from '@/ui/Data';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Textarea } from '@/ui/Field';
import { PAYMENT_TERMS } from '@/lib/erc8183/payment-terms';
import { useLiveSignMessage } from '@/lib/wallet/use-live-sign-message';
import { useLiveSwitchChain } from '@/lib/wallet/use-live-switch-chain';

const STATUS: Record<HiredJob['status'], { label: string; tone: string }> = {
  OPEN: { label: 'Not funded', tone: 'text-ink-3' },
  FUNDED: { label: 'To deliver', tone: 'text-watch' },
  /*
   * "Delivered", not "Buyer reviewing". Whether anyone is still reviewing
   * depends on the policy's window and the submission time, neither of
   * which a static label can know — so it kept saying "Buyer reviewing"
   * long after the window had closed and the payment was there to collect.
   * `sellerReleaseSummary` says the precise thing, underneath, where the
   * numbers have been read.
   */
  SUBMITTED: { label: 'Delivered', tone: 'text-info' },
  COMPLETED: { label: 'Paid', tone: 'text-ok' },
  REJECTED: { label: 'Rejected by vote', tone: 'text-bad' },
  EXPIRED: { label: 'Expired unpaid', tone: 'text-ink-3' },
};

/** Jobs shown before the rest are asked for. */
const JOBS_PAGE = 20;

const STAGES = { authorizing: 'Sign to authorise this delivery', storing: 'Storing the exact file', submitting: 'Approve the on-chain submission', confirming: 'Confirming on chain' } as const;

/**
 * Deliver a funded job by hand. The order matters and is enforced by the
 * API: the provider wallet signs a challenge, Pokter stores the exact bytes
 * and hashes them, the provider commits that hash on chain, and the index
 * checks the transaction. Nothing is marked delivered on a promise.
 */
function Composer({ job, account, staged }: { job: HiredJob; account: `0x${string}`; staged?: string }) {
  /*
   * An unfinished delivery survives a reload or a wallet prompt, kept for
   * this tab only and per provider, chain and job, so it never reappears
   * under another wallet. Cleared once the delivery is on chain.
   */
  const draftKey = `pokter.delivery-draft.${account.toLowerCase()}.${job.chainId}:${job.jobId}`;
  const [content, setContentState] = useState(() => {
    try {
      /*
       * A draft typed in this tab wins over text an assistant staged: the
       * seller's own unsaved words are the ones they would be angry to
       * lose. With no draft, the staged text is loaded, which is the whole
       * point of staging it — the assistant writes, the provider reviews
       * and signs. It is still only a draft until this form is submitted.
       */
      return window.sessionStorage.getItem(draftKey) || staged || '';
    } catch {
      return staged ?? '';
    }
  });
  const setContent = (value: string) => {
    setContentState(value);
    try {
      if (value.trim()) window.sessionStorage.setItem(draftKey, value);
      else window.sessionStorage.removeItem(draftKey);
    } catch {
      /* Storage blocked: the text stays in the form while the tab is open. */
    }
  };
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
  const { signMessageAsync } = useLiveSignMessage();

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
      // On chain now: the saved draft is done with, though the text stays on screen.
      try {
        window.sessionStorage.removeItem(draftKey);
      } catch {
        /* Nothing to clear. */
      }
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
      {staged && (
        <Notice tone="watch" title="Your assistant staged this text. Nothing has been delivered yet.">
          Read it before you sign: it is what will be hashed on chain and published for the buyer. Delivery is this
          transaction from your wallet, not the fact that it was written.
        </Notice>
      )}
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

/**
 * Collect your own payment.
 *
 * Nothing in Pokter let a seller do this. A delivered job said "Buyer
 * reviewing" and kept saying it, so work that had cleared its review
 * window — which can no longer be disputed, and which the escrow will
 * pay out to anyone who asks — looked exactly like work still under
 * review. Sellers waited on buyers who had no reason to come back, or on
 * somebody else's keeper.
 *
 * That the escrow pays anybody is measured, not assumed: testnet job #1502
 * was released by a wallet that was neither party, and `settle` has no
 * caller gate while `dispute` does. See `settleCallerAllowed`.
 *
 * The seller pays their own gas and the money goes to their own wallet, so
 * there is no custody here and nothing for Pokter to hold.
 */
function Collect({ job, account }: { job: HiredJob; account: `0x${string}` }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timing = useQuery({
    queryKey: ['review-timing', job.chainId, job.jobId],
    queryFn: () => readReviewTiming(job.chainId, BigInt(job.jobId)),
    staleTime: 60_000,
  });
  /*
   * A dispute leaves the job SUBMITTED while the policy's voters decide, so
   * status alone cannot tell a contested delivery from an uncontested one.
   * Without this the seller would be shown "Ready to collect" on work the
   * buyer had just challenged — the simulation would refuse the
   * transaction, but only after they had been invited to send it.
   */
  const dispute = useQuery({
    queryKey: ['dispute-state', job.chainId, job.jobId],
    queryFn: () => readDisputeState(job.chainId, BigInt(job.jobId)),
    staleTime: 60_000,
  });

  /*
   * Read from chain, not from the job row: the row has no submission time,
   * and the window is the policy's own and differs per chain.
   */
  const timed = timing.data && timing.data.submittedAt > 0 ? timing.data : null;
  /*
   * Re-renders once, when the window closes. Nothing on chain changes at
   * that moment, so without this the button would appear only on the next
   * reload — a seller watching the page would sit there while the payment
   * became collectable and the page kept counting down.
   */
  const nowMs = useClockThrough(timed ? timed.submittedAt + timed.disputeWindowSeconds : null);
  const summary = timed
    ? sellerReleaseSummary({ ...timed, now: Math.floor(nowMs / 1000) })
    : null;

  if (done) {
    return (
      <Notice tone="ok" title="Paid">
        The escrow released {amountOf(job)} to {shortAddress(account)}.{' '}
        <TxLink chainId={job.chainId} hash={done} label="View the transaction" />
      </Notice>
    );
  }
  /*
   * A failed read is said, not swallowed. Rendering nothing would leave a
   * seller with a collectable payment looking at a job that offers them
   * nothing, with no way to tell that from a job still under review.
   */
  if (timing.isError) {
    return (
      <p className="text-[13px] text-ink-3">
        The review window could not be read from {chainLabel(job.chainId)} just now, so this cannot say whether the payment is collectable yet. Reload to try again.
      </p>
    );
  }
  if (!summary) return null;

  if (dispute.data?.disputed) {
    return (
      <p className="text-[13px] text-ink-2">
        The buyer disputed this delivery, so it is the escrow policy&rsquo;s voters who decide it now and the payment cannot be
        released. If they do not reach a quorum by the deadline, the job expires and the budget returns to the buyer.
      </p>
    );
  }

  const collect = async () => {
    setBusy(true);
    setError(null);
    try {
      const transactionHash = await settleFromExternalWallet({ account, jobId: BigInt(job.jobId), action: 'approve', chainId: job.chainId });
      setDone(transactionHash);
      /*
       * Bring the public index up now rather than at the next sweep, the
       * same way the buyer's release does. Without it the agent's own
       * profile keeps showing this job unfinished — and a settled job is
       * precisely the evidence a seller wants on it. The route re-reads
       * the chain and trusts nothing sent here.
       */
      void fetch(`/api/jobs/${job.jobId}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve', transactionHash, chainId: job.chainId }),
      }).catch(() => {});
    } catch (caught) {
      const message = (caught as Error).message ?? 'The payment was not released.';
      setError(/reject|denied|cancel/i.test(message)
        ? 'Cancelled in the wallet. Nothing was sent and the payment is still there to collect.'
        : message.replace(/^ALREADY_[A-Z]+: /, ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-ink-2">{summary.text}</p>
      {/*
        * Offered while racing too. Past the deadline the escrow still pays
        * the seller until the buyer reclaims, so that is the moment the
        * button matters most — gating on `ready` alone would hide it
        * exactly when the money is about to go.
        */}
      {summary.state !== 'waiting' && (
        <Button size="s" busy={busy} disabled={busy} onClick={() => void collect()} className="self-start">
          {summary.state === 'racing' ? `Collect ${amountOf(job)} now` : `Release ${amountOf(job)} to yourself`}
        </Button>
      )}
      {error && <Notice tone="watch">{error}</Notice>}
    </div>
  );
}

/** The job's budget with its own token's symbol and decimals; an unread token is said to be unread, never called $U. */
function amountOf(job: HiredJob): string {
  return jobAmountLabel(job);
}

/** "real $U", "test USDT", or that the currency has not been read — from the job's token, not the chain. */
function moneyOf(job: HiredJob): string {
  const address = jobToken(job);
  const token = address ? paymentTokenAt(job.chainId, address) : null;
  if (!token) return address ? 'unrecognised token' : 'currency not yet read';
  return `${job.chainId === 56 ? 'real' : 'test'} ${displaySymbol(token)}`;
}

/**
 * @param staged Deliverable text an assistant wrote down for a job, keyed
 * `chainId:jobId`. It pre-fills the composer so the provider reviews and
 * signs rather than retyping; it is never a delivery by itself.
 * @param empty What to say instead when there are no jobs to show, where
 * the default ("No commissioned work yet") would not be true.
 */
export function DeliveryInbox({ jobs, staged = {}, empty }: { jobs: HiredJob[]; staged?: Record<string, string>; empty?: React.ReactNode }) {
  const { address, isConnected, chain } = useAccount();
  const { openConnect } = useConnect();
  const { switchChain, isPending: switching } = useLiveSwitchChain();
  const [open, setOpen] = useState<string | null>(null);
  /*
   * The first page, then the rest on request. The list stopped at 20 and
   * said nothing, so "All jobs" hid every older job of a busy agent with no
   * sign that there were more.
   */
  const [everything, setEverything] = useState(false);
  const connected = address ? getAddress(address) : null;
  // Each job is delivered on the escrow it was funded on.
  const wrongChainFor = (job: HiredJob) => Boolean(isConnected && chain?.id !== job.chainId);
  const order = (j: HiredJob) => (j.status === 'FUNDED' ? 0 : j.status === 'SUBMITTED' ? 1 : 2);
  const ordered = [...jobs].sort((a, b) => order(a) - order(b));

  if (ordered.length === 0) {
    if (empty) return empty;
    return <EmptyState title="No commissioned work yet">Jobs appear here when a buyer funds escrow for one of your agents. Agents with a live delivery endpoint receive them automatically.</EmptyState>;
  }
  return (
    <div>
      <ul className="ruled border-y border-rule">
        {(everything ? ordered : ordered.slice(0, JOBS_PAGE)).map((job) => {
          const s = STATUS[job.status];
          const isProvider = connected?.toLowerCase() === job.provider.toLowerCase();
          const wrongChain = wrongChainFor(job);
          return (
            <li key={job.id} className="flex flex-col gap-3 py-4">
              {/*
                Two columns that never wrap into each other: what the job is on
                the left, where it stands on the right. As a wrapping row, a
                long brief pushed the status and amount under it, to the left,
                so every row with a real brief was laid out differently from
                every row without one. The brief is one line; the job page has
                all of it, and the name is the way there.
              */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1">
                <Link href={jobHref(job)} className="truncate text-sm font-medium hover:underline">
                  {job.agentName} <span className="t-readout font-normal text-ink-3">#{job.jobId}</span>
                </Link>
                <span className={cn('text-right text-[13px] font-medium', s.tone)}>{s.label}</span>
                <p className="truncate text-[13px] text-ink-2" title={job.task}>
                  {job.task}
                </p>
                <span className="t-readout text-right text-[12.5px] text-ink-2">{amountOf(job)}</span>
                {/* Which network, real or test money, and while it is open, the deadline. */}
                <p className="col-span-2 text-[12px] text-ink-3">
                  <span className={job.chainId === 56 ? 'font-medium text-ink-2' : undefined}>
                    {chainLabel(job.chainId)} · {moneyOf(job)}
                  </span>
                  {job.expiredAt && (job.status === 'FUNDED' || job.status === 'SUBMITTED') && <> · deadline {new Date(job.expiredAt).toUTCString().slice(5, 22)} UTC</>}
                </p>
              </div>
              {job.status === 'SUBMITTED' && isProvider && !wrongChain && <Collect job={job} account={connected!} />}
              {job.status === 'SUBMITTED' && isProvider && wrongChain && (
                <Button size="s" intent="secondary" onClick={() => switchChain({ chainId: job.chainId === 56 ? 56 : 97 })} busy={switching} className="self-start">
                  Switch to {chainLabel(job.chainId)} to collect
                </Button>
              )}
              {job.status === 'FUNDED' &&
                (open === job.id ? (
                  isProvider && !wrongChain ? (
                    <Composer job={job} account={connected!} staged={staged[`${job.chainId}:${job.jobId}`]} />
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
      {!everything && ordered.length > JOBS_PAGE && (
        <button type="button" onClick={() => setEverything(true)} className="mt-3 text-[13px] font-medium text-ink-2 hover:text-ink">
          Show {ordered.length - JOBS_PAGE} more {ordered.length - JOBS_PAGE === 1 ? 'job' : 'jobs'}
        </button>
      )}
    </div>
  );
}
