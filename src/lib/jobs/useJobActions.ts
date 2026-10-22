'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseUnits } from 'viem';
import {
  buildClaimRefundCall,
  getErc8183DeliverableUrl,
  getErc8183Job,
  settleErc8183Job,
} from '@altananetwork/sdk';

import { NATIVE_SYMBOL } from '@/lib/network/presentation';
import { isReclaimable } from '@/lib/erc8183/reclaim-gate';
import type { HiredJob } from '@/lib/erc8183/types';
import { usePasskeySigner, usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { WALLET_NETWORK, walletClient, walletNetworkFor } from '@/lib/wallet/passkey';
import { updateRememberedJob } from '@/lib/wallet/activity';
import { walletActionError } from '@/lib/wallet/errors';
import { useActiveWallet } from '@/lib/wallet/active';
import { reclaimFromExternalWallet, settleFromExternalWallet } from '@/lib/wallet/external';
import { releaseAllowed } from './release';

const MIN_TRANSACTION_GAS = parseUnits('0.002', 18);
const POLL_MS = 30_000;

export type JobAction = 'refresh' | 'verify' | 'approve' | 'dispute' | 'reclaim';

/** Only http(s) deliverable links are ever rendered as links. */
export function safeDeliverableUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The deliverable URL Pokter's index kept for a job, or null.
 *
 * A job page reads the job this browser remembered at hire time, which
 * has no URL until the seller delivers, and then looked the URL up from
 * the chain in the browser. That search goes through the public endpoints,
 * which refuse or time out on mainnet log queries, so job 57017 showed
 * "No readable link was published" while Pokter's index held the URL the
 * seller had stated. The index is asked first; the chain stays the
 * fallback.
 */
async function indexedDeliverableUrl(job: Pick<HiredJob, 'jobId' | 'chainId'>): Promise<string | null> {
  try {
    const r = await fetch(`/api/jobs/${encodeURIComponent(job.jobId)}?chain=${job.chainId}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const body = (await r.json()) as { job?: { deliverableUrl?: unknown } };
    return typeof body.job?.deliverableUrl === 'string' ? body.job.deliverableUrl : null;
  } catch {
    return null;
  }
}

/**
 * Turns an escrow failure into something a buyer can act on, by the
 * router's error selectors where the chain gave one.
 */
export function settlementError(error: unknown, expired: boolean): string {
  const message = walletActionError(error, 'Escrow action');
  if (/0x17be5b7b/i.test(message)) {
    return 'The review window is still open, so the policy has not decided. Settle after it closes; refresh and try again then.';
  }
  if (/0x32d53d69/i.test(message)) {
    return 'This job was never registered with a dispute policy, so it can never be settled. After its deadline the escrow can be reclaimed. Nothing moved.';
  }
  if (/0x8e78f0cb/i.test(message)) {
    return 'The job is no longer awaiting settlement: it was already settled, refunded or reclaimed. Refresh to see its status. Nothing moved.';
  }
  if (/error occurred while executing calls|execution reverted/i.test(message)) {
    return expired
      ? 'The contract refused this call. Disputes are only accepted inside the review window, which has closed. Nothing moved.'
      : 'The contract refused this call and reported no reason. Nothing moved. Refresh the status and try again.';
  }
  return message;
}

/**
 * Buyer-side actions on one escrowed job: read it from chain, verify the
 * receipt, release, dispute or reclaim. Status is never assumed from elapsed
 * time; everything here is read from chain or recorded at hire time.
 */
export function useJobActions(initial: HiredJob) {
  const [job, setJob] = useState(initial);
  const [busy, setBusy] = useState<JobAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [receiptVerified, setReceiptVerified] = useState(false);
  const [disputeConfirmed, setDisputeConfirmed] = useState(false);
  // A ticking clock, so expiry-based states change while the page is open.
  const [openedAt, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  // Bumped when an action starts; a poll that began earlier then discards
  // its result instead of overwriting the action's.
  const generation = useRef(0);

  const { wallet } = usePasskeyWallet();
  const signer = usePasskeySigner();
  const activeWallet = useActiveWallet();
  // Reads and actions happen on the escrow this job was funded on. A browser
  // wallet is switched there by each action; the passkey wallet only ever
  // funded on its own network.
  const network = walletNetworkFor(job.chainId);

  const fundedAt = Date.parse(job.hiredAt);
  const expiresAt = Date.parse(job.expiredAt);
  const windowClosed = expiresAt <= openedAt;
  const reclaimable = isReclaimable(job, openedAt);
  const agreedWindow = expiresAt - fundedAt;
  // Funded with nothing submitted for over a third of the agreed window. A
  // fact about the job, not a diagnosis of the seller.
  const quiet =
    job.status === 'FUNDED' && agreedWindow > 0 && openedAt - fundedAt > agreedWindow / 3 && !windowClosed;

  const syncFromChain = useCallback(
    async (hashes?: Pick<Partial<HiredJob>, 'settleTxHash' | 'disputeTxHash' | 'reclaimTxHash'>, fromAction = false) => {
      const startedAt = generation.current;
      const owner = activeWallet.address;
      const current = await getErc8183Job(network, BigInt(job.jobId));
      const delivered = current.statusName === 'SUBMITTED' || current.statusName === 'COMPLETED';
      const deliverableUrl =
        job.deliverableUrl ??
        (delivered ? await indexedDeliverableUrl(job) : null) ??
        (delivered ? await getErc8183DeliverableUrl(network, BigInt(job.jobId)).catch(() => undefined) : undefined) ??
        null;
      if (!fromAction && generation.current !== startedAt) return;
      const updated: HiredJob = {
        ...job,
        status: current.statusName,
        statusCheckedAt: new Date().toISOString(),
        deliverableUrl,
        settleTxHash: hashes?.settleTxHash ?? job.settleTxHash,
        disputeTxHash: hashes?.disputeTxHash ?? job.disputeTxHash,
        reclaimTxHash: hashes?.reclaimTxHash ?? job.reclaimTxHash ?? null,
      };
      if (updated.deliverableUrl !== job.deliverableUrl) {
        setReviewed(false);
        setReceiptVerified(false);
      }
      setJob(updated);
      if (owner) updateRememberedJob(owner, updated);
    },
    [activeWallet.address, job, network],
  );

  // Poll only while the job waits on somebody else (OPEN, FUNDED), never
  // mid-signature, and never from a hidden tab.
  const watching = job.status === 'OPEN' || job.status === 'FUNDED';
  const syncRef = useRef(syncFromChain);
  useEffect(() => {
    syncRef.current = syncFromChain;
  }, [syncFromChain]);
  useEffect(() => {
    if (!watching || busy !== null) return;
    let stopped = false;
    const tick = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      void syncRef.current().catch(() => {});
    };
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [watching, busy]);

  // A delivered job remembered without its URL: read it once from the index, without waiting for a refresh.
  const needsUrl = (job.status === 'SUBMITTED' || job.status === 'COMPLETED') && !job.deliverableUrl;
  useEffect(() => {
    if (!needsUrl) return;
    let cancelled = false;
    void indexedDeliverableUrl(job).then((url) => {
      if (cancelled || !url) return;
      const updated: HiredJob = { ...job, deliverableUrl: url };
      setJob(updated);
      if (activeWallet.address) updateRememberedJob(activeWallet.address, updated);
    });
    return () => {
      cancelled = true;
    };
    // Once per job id: the job object changes as it syncs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsUrl, job.jobId, job.chainId]);

  async function requireGas(purpose: string) {
    if (!wallet) throw new Error('The passkey signer is unavailable.');
    const balances = await walletClient().balances({ wallet: wallet.address });
    if (balances.native < MIN_TRANSACTION_GAS) {
      throw new Error(`Your passkey wallet needs at least 0.002 ${NATIVE_SYMBOL} to ${purpose}.`);
    }
  }

  /**
   * `reviewClosed`: the escrow's review window has closed with no dispute.
   * Under the optimistic policy the delivery is then accepted and anyone may
   * settle, so the receipt check stops being a condition of releasing: it
   * protects nothing at that point, and a check Pokter cannot run (public
   * nodes refuse logs a week old; job 56:57001) would otherwise stop the
   * buyer paying an agent the escrow has already decided to pay.
   */
  const act = async (action: Exclude<JobAction, 'verify'>, { reviewClosed = false }: { reviewClosed?: boolean } = {}) => {
    generation.current += 1;
    setBusy(action);
    setError(null);
    try {
      if (action === 'refresh') {
        await syncFromChain(undefined, true);
        return;
      }
      if (!activeWallet.address) throw new Error('Connect the wallet that funded this job.');
      if (activeWallet.mode === 'passkey' && job.chainId !== WALLET_NETWORK.chainId) {
        throw new Error('This job is on a network the passkey wallet does not act on. Connect the browser wallet that funded it.');
      }
      let settleTxHash = job.settleTxHash;
      let disputeTxHash = job.disputeTxHash;
      let reclaimTxHash = job.reclaimTxHash ?? null;

      if (action === 'approve' || action === 'dispute') {
        // A disputed job's settlement is decided by the vote, not by this review, so the review gates apply only to releasing payment.
        if (action === 'approve') {
          const release = releaseAllowed({ reviewOpen: reviewClosed ? false : null, receiptVerified, disputed: Boolean(job.disputeTxHash) });
          if (!release.allowed) throw new Error(release.reason ?? 'This payment cannot be released yet.');
        }
        /* The "I have reviewed" box is a note to the buyer, not a financial control (JobDetail says so beside it), so it no longer gates the release. */
        if (action === 'dispute' && !disputeConfirmed) throw new Error('Confirm that you intend to contest this delivery.');
        let transactionHash: `0x${string}` | null = null;
        if (activeWallet.mode === 'external') {
          transactionHash = await settleFromExternalWallet({ account: activeWallet.address, jobId: BigInt(job.jobId), action, chainId: job.chainId });
        } else {
          await requireGas(action === 'approve' ? 'release payment' : 'open a dispute');
          if (!wallet || !signer) throw new Error('The passkey signer is unavailable.');
          const outcome = await settleErc8183Job(
            { address: wallet.address },
            signer,
            { jobId: BigInt(job.jobId), action },
            { network: WALLET_NETWORK },
          );
          transactionHash = outcome.transactionHash ?? null;
        }
        if (action === 'approve') settleTxHash = transactionHash;
        else disputeTxHash = transactionHash;
      }

      if (action === 'reclaim') {
        // The only possible destination is the wallet that funded it.
        if (activeWallet.mode === 'external') {
          reclaimTxHash = await reclaimFromExternalWallet({ account: activeWallet.address, jobId: BigInt(job.jobId), chainId: job.chainId });
        } else {
          await requireGas('reclaim this escrow');
          if (!wallet || !signer) throw new Error('The passkey signer is unavailable.');
          const outcome = await walletClient().execute({
            wallet: { address: wallet.address },
            signer,
            calls: [buildClaimRefundCall(WALLET_NETWORK.chainId, BigInt(job.jobId))],
          });
          reclaimTxHash = outcome.transactionHash ?? null;
        }
      }

      await syncFromChain({ settleTxHash, disputeTxHash, reclaimTxHash }, true);

      // Bring Pokter's public index up to date now rather than at the next
      // sweep. The server re-reads the job and checks the receipt itself.
      const transactionHash = action === 'approve' ? settleTxHash : action === 'dispute' ? disputeTxHash : reclaimTxHash;
      void fetch(`/api/jobs/${job.jobId}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, transactionHash, chainId: job.chainId }),
      }).catch(() => {});
    } catch (caught) {
      // Someone else already finished it: show the job as it is now, and say so plainly.
      if (/ALREADY_(COMPLETED|REJECTED|DISPUTED)/.test((caught as Error)?.message ?? '')) {
        await syncFromChain(undefined, true).catch(() => {});
        setError((caught as Error).message.replace(/^ALREADY_(COMPLETED|REJECTED|DISPUTED): /, ''));
        return;
      }
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
      const response = await fetch(`/api/deliverables/verify?jobId=${encodeURIComponent(job.jobId)}&chain=${job.chainId}`, { cache: 'no-store' });
      const result = (await response.json()) as { verified?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Receipt verification failed.');
      if (!result.verified) throw new Error('The delivered file does not match the hash recorded on chain.');
      setReceiptVerified(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return {
    job,
    busy,
    error,
    act,
    verifyReceipt,
    reviewed,
    setReviewed,
    receiptVerified,
    disputeConfirmed,
    setDisputeConfirmed,
    reclaimable,
    quiet,
    windowClosed,
    deliverableUrl: safeDeliverableUrl(job.deliverableUrl),
    walletMode: activeWallet.mode,
    walletAddress: activeWallet.address,
  };
}
