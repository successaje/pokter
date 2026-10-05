import 'server-only';

import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { getJobStore } from '@/lib/erc8183/store';

/** How long this agent's past deliveries took, from funding to submission. */
export interface DeliveryTimes {
  /** Delivered jobs with a readable submission time. */
  samples: number;
  medianMs: number | null;
  fastestMs: number | null;
  slowestMs: number | null;
  /** Share of sampled deliveries that landed before the job's deadline. */
  onTime: number | null;
}

const EMPTY: DeliveryTimes = { samples: 0, medianMs: null, fastestMs: null, slowestMs: null, onTime: null };
const SAMPLE = 8;
const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; value: DeliveryTimes }>();

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/**
 * The time from a buyer funding a job to the seller submitting its delivery,
 * read from the chain's `submittedAt` for the agent's most recent funded
 * jobs. The funding time is the one Pokter recorded at hire, which is the
 * moment the batch confirmed.
 *
 * At most eight jobs are read, in parallel, and the answer is cached for ten
 * minutes per agent: a dossier should not cost eight RPC calls per view. A
 * job whose read fails is left out rather than guessed at, and the count of
 * samples is shown beside the figure so a median of one reads as one.
 */
export async function deliveryTimes(chainId: number, tokenId: string): Promise<DeliveryTimes> {
  const key = `${chainId}:${tokenId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  /*
   * Every funded job, not only those the index last read as delivered: the
   * stored status is a snapshot from the buyer's last refresh and lags the
   * chain, which is where `submittedAt` is read from anyway.
   */
  const delivered = getJobStore()
    .byAgent(chainId, tokenId)
    .filter((job) => job.status !== 'OPEN')
    .sort((a, b) => b.hiredAt.localeCompare(a.hiredAt))
    .slice(0, SAMPLE);

  const readings = await Promise.all(
    delivered.map(async (job) => {
      try {
        const onChain = await getErc8183Job(ALTANA_NETWORK, BigInt(job.jobId));
        const submitted = Number(onChain.submittedAt) * 1000;
        const funded = Date.parse(job.hiredAt);
        if (!submitted || !Number.isFinite(funded) || submitted < funded) return null;
        return { ms: submitted - funded, onTime: submitted <= Date.parse(job.expiredAt) };
      } catch {
        return null;
      }
    }),
  );
  const samples = readings.filter((reading): reading is { ms: number; onTime: boolean } => reading !== null);
  const value: DeliveryTimes =
    samples.length === 0
      ? EMPTY
      : {
          samples: samples.length,
          medianMs: median(samples.map((sample) => sample.ms)),
          fastestMs: Math.min(...samples.map((sample) => sample.ms)),
          slowestMs: Math.max(...samples.map((sample) => sample.ms)),
          onTime: samples.filter((sample) => sample.onTime).length / samples.length,
        };
  cache.set(key, { at: Date.now(), value });
  return value;
}
