'use client';

import { useState } from 'react';
import { formatUnits, parseUnits } from 'viem';

import { shortAddress, shortHash } from '@/lib/ui/format';
import { JOB_STAGE_COPY, type HiredJob } from '@/lib/erc8183/types';
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
  const [busy, setBusy] = useState<null | 'refresh' | 'verify' | 'approve'>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [receiptVerified, setReceiptVerified] = useState(false);
  const { wallet } = usePasskeyWallet();
  const signer = usePasskeySigner();

  const act = async (action: 'refresh' | 'approve') => {
    setBusy(action);
    setError(null);
    try {
      if (!wallet)
        throw new Error('Connect the passkey wallet that funded this job.');

      let settleTxHash = job.settleTxHash;
      if (action === 'approve') {
        if (!signer) throw new Error('The passkey signer is unavailable.');
        if (!receiptVerified) {
          throw new Error(
            'Verify the receipt against its on-chain hash first.',
          );
        }
        if (!reviewed)
          throw new Error('Review the deliverable before releasing escrow.');
        const balances = await walletClient().balances({
          wallet: wallet.address,
        });
        if (balances.native < MIN_TRANSACTION_GAS) {
          throw new Error(
            'Your passkey wallet needs at least 0.002 tBNB to release escrow.',
          );
        }
        const outcome = await settleErc8183Job(
          { address: wallet.address },
          signer,
          { jobId: BigInt(job.jobId), action: 'approve' },
          { network: WALLET_NETWORK },
        );
        settleTxHash = outcome.transactionHash ?? null;
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
      };
      if (updated.deliverableUrl !== job.deliverableUrl) {
        setReviewed(false);
        setReceiptVerified(false);
      }
      setJob(updated);
      updateRememberedJob(wallet.address, updated);
    } catch (caught) {
      setError((caught as Error).message);
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
            Job #{job.jobId} · provider {shortAddress(job.provider)}
            {job.isTestnet && ' · testnet'}
          </p>
        </div>
        <span className="tabular text-sm">{budget} $U</span>
      </header>

      <JobStatusTrack status={job.status} />

      <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
        {JOB_STAGE_COPY[job.status]}
      </p>

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
          </div>
        )}
      </div>
    </article>
  );
}
