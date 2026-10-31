import 'server-only';

import { keccak256, stringToBytes } from 'viem';

import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { readDeliveredAnswer, type DeliveredAnswer } from '@/lib/delivery/answer';
import { checkDeliveredPlan, type PlanCheckReport } from '@/lib/delivery/plan-checks';
import { briefIsPublic, jobFunder, publishableAnswerText, type JobFunder } from '@/lib/jobs/evidence-view';
import { altanaNetworkFor } from '@/lib/altana/client';
import { readDeliveryText } from '@/lib/delivery/read-delivery';
import { manifestMatch } from '@/lib/erc8183/manifest-match';
import { getErc8183Job } from '@altananetwork/sdk';
import { teamWalletSet } from '@/lib/team/server';
import { answerIsPublic } from '@/lib/jobs/answer-publication';
import { deliveryKind, type DeliveryKind } from './delivery-kind';

/** A delivered file, unpacked far enough to show on the dossier. */
export interface SampleDelivery {
  chainId: number;
  jobId: string;
  /** Who paid for the job: it decides whether the brief is shown (`briefIsPublic`), never whether the work is. */
  funder: JobFunder;
  status: HiredJob['status'];
  hiredAt: string;
  budgetRaw: string;
  /** Who produced it: the agent itself, or Pokter's seller standing in. */
  producer: string | null;
  /** What the delivered file is evidence of (see `deliveryKind`). */
  kind: DeliveryKind;
  generatedAt: string | null;
  providerLabel: string | null;
  /** keccak256 of the exact bytes served, which is what the chain committed to. */
  manifestHash: `0x${string}`;
  /** The brief the buyer wrote, when the file carries it back — kept only for Pokter's own test hires. */
  asked: string | null;
  title: string | null;
  /** Every other top-level field of the response, in order. */
  fields: { label: string; value: unknown }[];
  /** The raw response when it is not JSON Pokter can unpack. */
  raw: string | null;
  /** The result in the agent's own words, when it gave one (see `readDeliveredAnswer`). */
  result: string | null;
  /** What the agent itself said the answer does not cover. */
  limitations: string[];
  /**
   * The whole delivery read the way a job's own page reads it, so the
   * profile shows a sample in the same renderer rather than as raw field
   * values. `asked` is cleared unless the brief may be shown.
   */
  answer: DeliveredAnswer;
  /** Pokter's checks on the answer, against the brief only when the brief may be shown. */
  checks: PlanCheckReport | null;
}

const SHOWABLE: HiredJob['status'][] = ['COMPLETED', 'SUBMITTED'];

function parsedContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function unpack(content: string): Pick<SampleDelivery, 'asked' | 'title' | 'fields' | 'raw'> {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { asked: null, title: null, fields: [], raw: content };
    const object = parsed as Record<string, unknown>;
    let asked: string | null = null;
    if (typeof object.task === 'string') {
      try {
        const task = JSON.parse(object.task) as { task?: unknown };
        asked = typeof task.task === 'string' ? task.task : object.task;
      } catch {
        asked = object.task;
      }
    }
    const title = typeof object.title === 'string' ? object.title : null;
    const fields = Object.entries(object)
      .filter(([key]) => key !== 'task' && key !== 'title')
      .map(([key, value]) => ({ label: key.replace(/_/g, ' '), value }));
    return { asked, title, fields, raw: null };
  } catch {
    return { asked: null, title: null, fields: [], raw: content };
  }
}

/** A job's sample, read once: an answer that matches its hash does not change; a miss is tried again later. */
const cache = new Map<string, { sample: SampleDelivery | null; at: number }>();
const MISS_TTL_MS = 10 * 60_000;
const CACHE_LIMIT = 500;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/** From Pokter's own stored copy, when it holds one: no network. */
function storedSample(job: HiredJob, funder: JobFunder): SampleDelivery | null {
  const stored = readDeliverable(deliverableKey(job.chainId, job.jobId));
  if (!stored) return null;
  /* Shown with the buyer's own address taken out unless it is Pokter's test; the hash is of the original. */
  const shown = publishableAnswerText(stored.manifestText, funder, job.client);
  let manifest: { response?: { content?: unknown }; metadata?: Record<string, unknown> };
  try {
    manifest = JSON.parse(shown) as typeof manifest;
  } catch {
    return null;
  }
  const content = typeof manifest.response?.content === 'string' ? manifest.response.content : null;
  if (content === null) return null;
  const metadata = manifest.metadata ?? {};
  const producer = typeof metadata.producer === 'string' ? metadata.producer : null;
  const answer = readDeliveredAnswer(shown);
  const unpacked = unpack(content);
  return {
    chainId: job.chainId,
    jobId: job.jobId,
    status: job.status,
    funder,
    hiredAt: job.hiredAt,
    budgetRaw: job.budgetRaw,
    producer,
    kind: deliveryKind(producer, parsedContent(content)),
    generatedAt: typeof metadata.generated_at === 'string' ? metadata.generated_at : null,
    providerLabel: job.providerLabel ?? null,
    manifestHash: keccak256(stringToBytes(stored.manifestText)),
    ...unpacked,
    asked: briefIsPublic(funder) ? unpacked.asked : null,
    result: answer.result,
    limitations: answer.limitations,
    answer: { ...answer, asked: briefIsPublic(funder) ? answer.asked : null },
    checks: checkDeliveredPlan(shown, briefIsPublic(funder) ? job.task : null),
  };
}

/**
 * From the agent's own published delivery: the link it committed to,
 * read the way the job pages read it, and kept only when its bytes match
 * the hash on chain. Most agents deliver from their own servers, so
 * without this their real answers could never be a sample.
 */
async function publishedSample(job: HiredJob, funder: JobFunder): Promise<SampleDelivery | null> {
  if (job.chainId !== 56 && job.chainId !== 97) return null;
  const key = `${job.chainId}:${job.jobId}`;
  const known = cache.get(key);
  if (known && (known.sample || Date.now() - known.at < MISS_TTL_MS)) return known.sample;
  const remember = (sample: SampleDelivery | null) => {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, { sample, at: Date.now() });
    return sample;
  };
  const onchain = await withTimeout(getErc8183Job(altanaNetworkFor(job.chainId), BigInt(job.jobId)), 6_000);
  if (!onchain || !SHOWABLE.includes(onchain.statusName as HiredJob['status'])) return remember(null);
  const read = await readDeliveryText(job.chainId, job.jobId, { deliverable: onchain.deliverable as `0x${string}`, submittedAt: onchain.submittedAt }, 6_000);
  if (!read.ok || !manifestMatch(read.text, onchain.deliverable)) return remember(null);
  const shown = publishableAnswerText(read.text, funder, onchain.client);
  const answer = readDeliveredAnswer(shown);
  return remember({
    chainId: job.chainId,
    jobId: job.jobId,
    status: onchain.statusName as HiredJob['status'],
    funder,
    hiredAt: job.hiredAt,
    budgetRaw: job.budgetRaw,
    producer: answer.producer,
    kind: 'agent',
    generatedAt: answer.generatedAt,
    providerLabel: job.providerLabel ?? null,
    manifestHash: keccak256(stringToBytes(read.text)),
    asked: briefIsPublic(funder) ? answer.asked : null,
    title: answer.title,
    fields: answer.fields,
    raw: answer.raw,
    result: answer.result,
    limitations: answer.limitations,
    answer: { ...answer, asked: briefIsPublic(funder) ? answer.asked : null },
    checks: checkDeliveredPlan(shown, briefIsPublic(funder) ? job.task : null),
  });
}

/**
 * How many of an agent's deliveries without a stored copy are read from
 * their links for one page, together. Three gave up on agents whose best
 * candidates were down while a later delivery read fine.
 */
const PUBLISHED_READS = 6;

/**
 * The thing this agent delivered that best shows its work: a real buyer's
 * completed job before a test, a completed job before one still in review,
 * newest first — from Pokter's stored copy when it holds one, else from the
 * agent's own published delivery, checked against the hash on chain.
 *
 * Only a job whose answer is public can be the sample (`answerIsPublic`):
 * Pokter's own tests, a self-hire, or a job whose buyer chose to publish
 * its answer. That every job was delivered stays on the agent's record and
 * its evidence pages either way; what an outside buyer's answer says is
 * theirs to publish. The brief (`asked`) is kept only for Pokter's own test
 * hires, as on the job evidence pages (`briefIsPublic`).
 *
 * Stored copies are keyed per chain (`deliverableKey`: the bare id on 97,
 * `56:id` on BNB Chain). This read the bare id, so no mainnet delivery was
 * ever found, and agents with eight delivered mainnet jobs were described
 * as never having delivered one.
 *
 * A lifecycle demonstration is Pokter's seller proving the escrow works,
 * so an answer the agent gave is always preferred over one, however
 * recent the demonstration.
 */
export async function sampleDelivery(chainId: number, tokenId: string): Promise<SampleDelivery | null> {
  const team = teamWalletSet();
  const store = getJobStore();
  const funderOf = (job: HiredJob) => jobFunder({ client: job.client, provider: job.provider }, team);
  const jobs = store
    .byAgent(chainId, tokenId)
    .filter((job) => SHOWABLE.includes(job.status))
    .filter((job) => answerIsPublic(funderOf(job), store.answerPublication(job.chainId, job.jobId)))
    .sort(
      (a, b) =>
        SHOWABLE.indexOf(a.status) - SHOWABLE.indexOf(b.status) ||
        Number(funderOf(a) === 'team') - Number(funderOf(b) === 'team') ||
        b.hiredAt.localeCompare(a.hiredAt),
    );

  const stored = new Map(jobs.map((job) => [job, storedSample(job, funderOf(job))] as const));
  /* The links of the best few without a stored copy, read together, so one slow agent server costs one wait. */
  const toRead = jobs.filter((job) => !stored.get(job)).slice(0, PUBLISHED_READS);
  const published = new Map(await Promise.all(toRead.map(async (job) => [job, await publishedSample(job, funderOf(job))] as const)));

  let fallback: SampleDelivery | null = null;
  for (const job of jobs) {
    const sample = stored.get(job) ?? published.get(job) ?? null;
    if (!sample) continue;
    if (sample.kind !== 'lifecycle') return sample;
    fallback ??= sample;
  }
  return fallback;
}
