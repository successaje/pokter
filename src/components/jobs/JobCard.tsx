'use client';

import { useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { NATIVE_SYMBOL } from '@/lib/network/presentation';

import { shortAddress, shortHash } from '@/lib/ui/format';
import { JOB_STAGE_COPY, type HiredJob } from '@/lib/erc8183/types';
import { supportMailto } from '@/lib/support/contact';
import { JobStatusTrack } from './JobStatus';
import {
  getErc8183DeliverableUrl,
  getErc8183Job,
  settleErc8183Job,
} from '@altananetwork/sdk';
import {
  usePasskeySigner,
  usePasskeyWallet,
} from '@/components/wallet/PasskeyProvider';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { updateRememberedJob } from '@/lib/wallet/activity';
import { walletActionError } from '@/lib/wallet/errors';

const MIN_TRANSACTION_GAS = parseUnits('0.002', 18);

function safeDeliverableUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function settlementError(error: unknown, expired: boolean): string {
  const message = walletActionError(error, 'Escrow action');
  if (/0x17be5b7b/i.test(message)) {
    return 'The dispute window is still open. The contract will allow payment after the review period ends; refresh and try again shortly.';
  }
  /*
   * The SDK reports a reverted batch as "An error occurred while executing
   * calls", which was shown to the buyer unchanged. Someone contesting a
   * delivery and reading that learns nothing: not what failed, not whether
   * their money moved, not what to do instead.
   *
   * Past the expiry the kernel will not accept a dispute at all, and that is
   * the likeliest reason this reverts, so it is named. The escrow is not lost
   * — an expired job is reclaimable — and saying so is the part that matters.
   */
  if (/error occurred while executing calls|execution reverted/i.test(message)) {
    return expired
      ? 'This job has passed its expiry, so the contract no longer accepts a dispute. Nothing moved and the escrow is still yours to reclaim.'
      : 'The contract refused this call and reported no reason. Nothing moved. Refresh the status and try again.';
  }
  return message;
}

/**
 * §55 / §58. A commissioned job.
 *
 * Status is never assumed from elapsed time: Refresh re-reads the kernel, and
 * everything shown is either read from chain or recorded at hire time.
 */
export function JobCard({
  job: initial,
  explorerBase,
}: {
  job: HiredJob;
  explorerBase: string;
}) {
  const [job, setJob] = useState(initial);
  const [busy, setBusy] = useState<
    null | 'refresh' | 'verify' | 'approve' | 'dispute'
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [receiptVerified, setReceiptVerified] = useState(false);
  const [disputeConfirmed, setDisputeConfirmed] = useState(false);

  /*
   * Read from the job rather than from a failed call: the card already knows
   * when the job expires, so it can say the window has closed instead of
   * letting the buyer discover it by signing a transaction that reverts.
   *
   * Sampled once on mount rather than on every render. The clock is not a
   * pure input, and a component that re-reads it mid-render can produce two
   * different answers for one paint. A job crossing its expiry while the page
   * sits open is caught by Refresh, which re-reads the chain anyway.
   */
  const [openedAt] = useState(() => Date.now());
  const windowClosed = Date.parse(job.expiredAt) <= openedAt;
  const { wallet } = usePasskeyWallet();
  const signer = usePasskeySigner();

  const act = async (action: 'refresh' | 'approve' | 'dispute') => {
    setBusy(action);
    setError(null);
    try {
      if (!wallet)
        throw new Error('Connect the passkey wallet that funded this job.');

      let settleTxHash = job.settleTxHash;
      let disputeTxHash = job.disputeTxHash;
      if (action === 'approve' || action === 'dispute') {
        if (!signer) throw new Error('The passkey signer is unavailable.');
        if (action === 'approve' && !receiptVerified) {
          throw new Error(
            'Verify the receipt against its on-chain hash first.',
          );
        }
        if (action === 'approve' && !reviewed)
          throw new Error('Review the deliverable before releasing escrow.');
        if (action === 'dispute' && !disputeConfirmed)
          throw new Error('Confirm that you intend to contest this delivery.');
        const balances = await walletClient().balances({
          wallet: wallet.address,
        });
        if (balances.native < MIN_TRANSACTION_GAS) {
          throw new Error(
            `Your passkey wallet needs at least 0.002 ${NATIVE_SYMBOL} to ${action === 'approve' ? 'release escrow' : 'open a dispute'}.`,
          );
        }
        const outcome = await settleErc8183Job(
          { address: wallet.address },
          signer,
          { jobId: BigInt(job.jobId), action },
          { network: WALLET_NETWORK },
        );
        if (action === 'approve') settleTxHash = outcome.transactionHash ?? null;
        else disputeTxHash = outcome.transactionHash ?? null;
      }

      const current = await getErc8183Job(WALLET_NETWORK, BigInt(job.jobId));
      const deliverableUrl =
        job.deliverableUrl ??
        (current.statusName === 'SUBMITTED' ||
        current.statusName === 'COMPLETED'
          ? await getErc8183DeliverableUrl(
              WALLET_NETWORK,
              BigInt(job.jobId),
            ).catch(() => undefined)
          : undefined) ??
        null;
      const updated: HiredJob = {
        ...job,
        status: current.statusName,
        statusCheckedAt: new Date().toISOString(),
        deliverableUrl,
        settleTxHash,
        disputeTxHash,
      };
      if (updated.deliverableUrl !== job.deliverableUrl) {
        setReviewed(false);
        setReceiptVerified(false);
      }
      setJob(updated);
      updateRememberedJob(wallet.address, updated);
    } catch (caught) {
      setError(settlementError(caught, Date.parse(job.expiredAt) <= Date.now()));
    } finally {
      setBusy(null);
    }
  };

  const verifyReceipt = async () => {
    setBusy('verify');
    setError(null);
    setReceiptVerified(false);
    try {
      const response = await fetch(
        `/api/deliverables/verify?jobId=${encodeURIComponent(job.jobId)}`,
        { cache: 'no-store' },
      );
      const result = (await response.json()) as {
        verified?: boolean;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Receipt verification failed.');
      if (!result.verified) {
        throw new Error(
          'Receipt verification failed: the served bytes do not match the on-chain hash.',
        );
      }
      setReceiptVerified(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const budget = formatUnits(BigInt(job.budgetRaw), 18);
  const settleable = job.status === 'SUBMITTED';
  const deliverableUrl = safeDeliverableUrl(job.deliverableUrl);

  return (
    <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-medium">{job.agentName}</h3>
          <p className="mono text-[11px] text-[color:var(--text-faint)]">
            Job #{job.jobId} · provider{' '}
            {job.providerLabel ? `${job.providerLabel} · ` : ''}
            {shortAddress(job.provider)}
            {job.isTestnet && ' · testnet'}
          </p>
        </div>
        <span className="tabular text-sm">{budget} $U</span>
      </header>

      <JobStatusTrack status={job.status} />

      <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
        {JOB_STAGE_COPY[job.status]}
      </p>

      {/*
        A way out, at the two states where someone is stuck.
        
        FUNDED means the money has left and nothing has come back yet;
        EXPIRED means it never will. Those are the moments a person wants to
        talk to someone, and until now the only route was to find the GitHub
        icon in the footer and guess. The link carries the job id so the reply
        can begin with what the chain says rather than with a question.

        Not shown on SUBMITTED or COMPLETED: there the next action is on this
        card already, and offering help instead would be a distraction from
        it.
      */}
      {(job.status === 'FUNDED' || job.status === 'EXPIRED') && (
        <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          {job.status === 'EXPIRED'
            ? 'The budget is yours to reclaim from the escrow contract. '
            : 'Waiting longer than you expected? '}
          <a
            href={supportMailto({
              subject:
                job.status === 'EXPIRED'
                  ? 'Expired job'
                  : 'Funded job with no delivery',
              jobId: job.jobId,
            })}
            className="text-[color:var(--info)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            Ask us what the chain says
          </a>
          .
        </p>
      )}

      <dl className="grid gap-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3 text-[10px] sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="uppercase tracking-wide text-[color:var(--text-faint)]">
            ERC-8004 identity
          </dt>
          <dd className="mt-1 break-words text-[color:var(--text-secondary)] [overflow-wrap:anywhere]">
            {job.agentName}
            {job.agentChainId && ` · chain ${job.agentChainId}`}
            {job.agentTokenId !== 'unknown' && ` · token #${job.agentTokenId}`}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="uppercase tracking-wide text-[color:var(--text-faint)]">
            ERC-8183 provider
          </dt>
          <dd className="mono mt-1 break-all text-[color:var(--text-secondary)]">
            {job.providerLabel ? `${job.providerLabel} · ` : ''}
            {job.provider}
          </dd>
        </div>
      </dl>

      <details className="group">
        <summary className="cursor-pointer text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
          Task brief
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)] p-3 text-[10px] leading-relaxed text-[color:var(--text-secondary)]">
          {job.task}
        </pre>
      </details>

      {deliverableUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={deliverableUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="w-fit rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
          >
            View deliverable →
          </a>
          <button
            type="button"
            onClick={verifyReceipt}
            disabled={busy !== null}
            className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
          >
            {busy === 'verify'
              ? 'Verifying bytes…'
              : receiptVerified
                ? 'Receipt verified ✓'
                : 'Verify on-chain receipt'}
          </button>
        </div>
      )}

      {job.deliverableUrl && !deliverableUrl && (
        <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-2.5 text-[11px] leading-relaxed text-[color:var(--caution)]">
          The submitted deliverable uses an unsupported or malformed URL. Do not
          release escrow until the seller provides a valid HTTP(S) deliverable.
        </p>
      )}

      <dl className="flex flex-col gap-1 border-t border-[color:var(--border)] pt-3 text-[11px]">
        <div className="flex justify-between gap-3">
          <dt className="text-[color:var(--text-faint)]">Expires</dt>
          <dd className="mono">
            {job.expiredAt.slice(0, 16).replace('T', ' ')} UTC
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[color:var(--text-faint)]">Status read</dt>
          <dd className="mono">{job.statusCheckedAt.slice(11, 19)} UTC</dd>
        </div>
        {job.hireTxHash && (
          <div className="flex justify-between gap-3">
            <dt className="text-[color:var(--text-faint)]">Hire tx</dt>
            <dd>
              <a
                href={`${explorerBase}/tx/${job.hireTxHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
              >
                {shortHash(job.hireTxHash)}
              </a>
            </dd>
          </div>
        )}
        {job.settleTxHash && (
          <div className="flex justify-between gap-3">
            <dt className="text-[color:var(--text-faint)]">Settle tx</dt>
            <dd>
              <a
                href={`${explorerBase}/tx/${job.settleTxHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
              >
                {shortHash(job.settleTxHash)}
              </a>
            </dd>
          </div>
        )}
        {job.disputeTxHash && (
          <div className="flex justify-between gap-3">
            <dt className="text-[color:var(--text-faint)]">Dispute tx</dt>
            <dd>
              <a
                href={`${explorerBase}/tx/${job.disputeTxHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
              >
                {shortHash(job.disputeTxHash)}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {error && (
        <p className="rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-2.5 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => act('refresh')}
          disabled={busy !== null}
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
        >
          {busy === 'refresh' ? 'Reading chain…' : 'Refresh status'}
        </button>

        {settleable && deliverableUrl && (
          <div className="flex w-full flex-col gap-2 rounded-[var(--radius)] border border-[color:var(--border)] p-3">
            <label className="flex items-start gap-2 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
                disabled={busy !== null || !receiptVerified}
                className="mt-0.5"
              />
              I opened and reviewed the submitted deliverable. Releasing escrow
              is an on-chain approval that pays the seller.
            </label>
            {!receiptVerified && (
              <p className="text-[10px] leading-relaxed text-[color:var(--caution)]">
                Verify the exact receipt bytes against the on-chain hash before
                approving payment.
              </p>
            )}
            <button
              type="button"
              onClick={() => act('approve')}
              disabled={busy !== null || !reviewed || !receiptVerified}
              className="w-fit rounded-[var(--radius)] bg-[color:var(--positive)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'approve' ? 'Releasing…' : 'Release escrow'}
            </button>

            <div className="mt-1 border-t border-[color:var(--border)] pt-3">
              <label className="flex items-start gap-2 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={disputeConfirmed}
                  onChange={(event) =>
                    setDisputeConfirmed(event.target.checked)
                  }
                  disabled={busy !== null}
                  className="mt-0.5"
                />
                This delivery is unacceptable. I understand that contesting it
                starts the on-chain dispute process and does not release payment.
              </label>
              {windowClosed && (
                <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--caution)]">
                  The dispute window closed when this job expired on{' '}
                  {job.expiredAt.slice(0, 10)}. The escrow was never released
                  and is still yours to reclaim.
                </p>
              )}
              <button
                type="button"
                onClick={() => act('dispute')}
                disabled={busy !== null || !disputeConfirmed || windowClosed}
                className="mt-2 w-fit rounded-[var(--radius)] border border-[color:var(--negative)]/45 px-3 py-1.5 text-[12px] font-medium text-[color:var(--negative)] transition-colors hover:bg-[color:var(--negative-dim)] disabled:opacity-50"
              >
                {busy === 'dispute' ? 'Opening dispute…' : 'Contest delivery'}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
