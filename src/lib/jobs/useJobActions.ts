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
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { updateRememberedJob } from '@/lib/wallet/activity';
import { walletActionError } from '@/lib/wallet/errors';
import { useActiveWallet } from '@/lib/wallet/active';
import { reclaimFromExternalWallet, settleFromExternalWallet } from '@/lib/wallet/external';

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
 * Turns an escrow failure into something a buyer can act on. Past expiry the
 * kernel refuses a dispute, which is the likeliest cause of an unexplained
 * revert, and the escrow is still reclaimable, so that is what gets said.
 */
export function settlementError(error: unknown, expired: boolean): string {
  const message = walletActionError(error, 'Escrow action');
  if (/0x17be5b7b/i.test(message)) {
    return 'The dispute window is still open. Payment can be released after the review period ends; refresh and try again shortly.';
  }
  if (/error occurred while executing calls|execution reverted/i.test(message)) {
    return expired
      ? 'This job has passed its expiry, so the contract no longer accepts a dispute. Nothing moved and the escrow is still yours to reclaim.'
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
      const current = await getErc8183Job(WALLET_NETWORK, BigInt(job.jobId));
      const deliverableUrl =
        job.deliverableUrl ??
        (current.statusName === 'SUBMITTED' || current.statusName === 'COMPLETED'
          ? await getErc8183DeliverableUrl(WALLET_NETWORK, BigInt(job.jobId)).catch(() => undefined)
          : undefined) ??
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
    [activeWallet.address, job],
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

  async function requireGas(purpose: string) {
    if (!wallet) throw new Error('The passkey signer is unavailable.');
    const balances = await walletClient().balances({ wallet: wallet.address });
    if (balances.native < MIN_TRANSACTION_GAS) {
      throw new Error(`Your passkey wallet needs at least 0.002 ${NATIVE_SYMBOL} to ${purpose}.`);
    }
  }

  const act = async (action: Exclude<JobAction, 'verify'>) => {
    generation.current += 1;
    setBusy(action);
    setError(null);
    try {
      if (action === 'refresh') {
        await syncFromChain(undefined, true);
        return;
      }
      if (!activeWallet.address) throw new Error('Connect the wallet that funded this job.');
      let settleTxHash = job.settleTxHash;
      let disputeTxHash = job.disputeTxHash;
      let reclaimTxHash = job.reclaimTxHash ?? null;

      if (action === 'approve' || action === 'dispute') {
        if (action === 'approve' && !receiptVerified) throw new Error('Verify the receipt against its on-chain hash first.');
        if (action === 'approve' && !reviewed) throw new Error('Review the deliverable before releasing payment.');
        if (action === 'dispute' && !disputeConfirmed) throw new Error('Confirm that you intend to contest this delivery.');
        let transactionHash: `0x${string}` | null = null;
        if (activeWallet.mode === 'external') {
          transactionHash = await settleFromExternalWallet({ account: activeWallet.address, jobId: BigInt(job.jobId), action });
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
          reclaimTxHash = await reclaimFromExternalWallet({ account: activeWallet.address, jobId: BigInt(job.jobId) });
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
        body: JSON.stringify({ action, transactionHash }),
      }).catch(() => {});
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
      const response = await fetch(`/api/deliverables/verify?jobId=${encodeURIComponent(job.jobId)}`, { cache: 'no-store' });
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
