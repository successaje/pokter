import 'server-only';

import { getErc8183DeliverableUrl, getErc8183Job } from '@altananetwork/sdk';

import { altanaNetworkFor } from '@/lib/altana/client';
import { clearDeliverableMismatch, deliverableKey, readDeliverable, readDeliverableMismatch, recordDeliverableMismatch, writeDeliverable } from '@/lib/erc8183/deliverables';
import { keccak256, stringToBytes } from 'viem';
import { fetchDeliverableText } from '@/lib/erc8183/fetch-deliverable';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';

import { readCheckMarker } from './paid-brief';
import { manifestMatch } from '@/lib/erc8183/manifest-match';

/**
 * Bring an outside agent's delivery into the store the graders read.
 *
 * Paid checks graded only what was in Pokter's own deliverables store,
 * which only Pokter's own sellers write to. An outside agent's fixture
 * could deliver, settle and be paid, and still be graded "undelivered":
 * Venus Rate Router's jobs 1520 and 1521 were COMPLETED on chain and
 * recorded as delivering nothing.
 *
 * For a fixture job the chain says is delivered, this reads the URL the
 * agent committed (from Pokter's index, else the chain), fetches it, and
 * keeps it only if its bytes hash to the deliverable on chain. A delivery
 * that cannot be fetched, or does not match, is not stored, and the job
 * stays ungraded rather than being called undelivered.
 */
export async function captureDeliverables(jobs: readonly HiredJob[]): Promise<{ captured: number; unreadable: number }> {
  let captured = 0;
  let unreadable = 0;
  for (const job of jobs) {
    const key = deliverableKey(job.chainId, job.jobId);
    if (readDeliverable(key)) continue;
    const network = altanaNetworkFor(job.chainId);
    const onchain = await getErc8183Job(network, BigInt(job.jobId)).catch(() => null);
    if (!onchain || (onchain.statusName !== 'SUBMITTED' && onchain.statusName !== 'COMPLETED')) continue;
    try {
      const url = job.deliverableUrl ?? (await getErc8183DeliverableUrl(network, BigInt(job.jobId)).catch(() => undefined));
      if (!url) throw new Error('no deliverable URL');
      const text = await fetchDeliverableText(url);
      if (!manifestMatch(text, onchain.deliverable)) {
        // Read, but not what was committed: remembered, so the check can say so.
        recordDeliverableMismatch({ jobId: key, servedHash: keccak256(stringToBytes(text)), chainHash: onchain.deliverable, checkedAt: new Date().toISOString() });
        throw new Error('bytes do not match the on-chain hash');
      }
      writeDeliverable({ jobId: key, manifestText: text, submitTxHash: null, createdAt: new Date().toISOString() });
      clearDeliverableMismatch(key);
      if (!job.deliverableUrl) getJobStore().record({ ...job, deliverableUrl: url });
      captured += 1;
    } catch {
      unreadable += 1;
    }
  }
  return { captured, unreadable };
}

const recentMismatch = (key: string) => {
  const m = readDeliverableMismatch(key);
  return Boolean(m && Date.now() - Date.parse(m.checkedAt) < 24 * 60 * 60_000);
};

/** Fixtures fetched per sweep pass, so a slow agent host cannot stall the sweep. */
const CAPTURE_PER_PASS = 12;

/**
 * Every fixture job Pokter's index already shows as delivered, whose
 * deliverable is not stored yet. Run before grading, so the graders see it.
 */
export async function captureFixtureDeliverables(): Promise<{ captured: number; unreadable: number }> {
  const due = getJobStore()
    .all()
    .filter(
      (job) =>
        readCheckMarker(job.task) !== null &&
        (job.status === 'SUBMITTED' || job.status === 'COMPLETED') &&
        !readDeliverable(deliverableKey(job.chainId, job.jobId)) &&
        // A mismatch found in the last day is not refetched every pass; after that, in case it was fixed.
        !recentMismatch(deliverableKey(job.chainId, job.jobId)),
    )
    .slice(0, CAPTURE_PER_PASS);
  return captureDeliverables(due);
}
