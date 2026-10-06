import 'server-only';

import { keccak256, stringToBytes } from 'viem';

import { readDeliverable } from '@/lib/erc8183/deliverables';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';

/** A delivered file, unpacked far enough to show on the dossier. */
export interface SampleDelivery {
  jobId: string;
  status: HiredJob['status'];
  hiredAt: string;
  budgetRaw: string;
  /** Who produced it: the agent itself, or Pokter's seller standing in. */
  producer: string | null;
  generatedAt: string | null;
  providerLabel: string | null;
  /** keccak256 of the exact bytes served, which is what the chain committed to. */
  manifestHash: `0x${string}`;
  /** The brief the buyer wrote, when the file carries it back. */
  asked: string | null;
  title: string | null;
  /** Every other top-level field of the response, in order. */
  fields: { label: string; value: unknown }[];
  /** The raw response when it is not JSON Pokter can unpack. */
  raw: string | null;
}

const SHOWABLE: HiredJob['status'][] = ['COMPLETED', 'SUBMITTED'];

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

/**
 * The most recent thing this agent actually delivered through Pokter, read
 * from the stored manifest rather than described.
 *
 * Only delivered or settled jobs count, and only where Pokter holds the
 * exact bytes that were hashed on chain; a funded job with nothing back is
 * not a sample of anything. The hash is recomputed from those bytes so the
 * page can show the figure the chain holds, and the client checks it against
 * the contract when the section is opened.
 */
export function sampleDelivery(chainId: number, tokenId: string): SampleDelivery | null {
  const jobs = getJobStore()
    .byAgent(chainId, tokenId)
    .filter((job) => SHOWABLE.includes(job.status))
    .sort((a, b) => SHOWABLE.indexOf(a.status) - SHOWABLE.indexOf(b.status) || b.hiredAt.localeCompare(a.hiredAt));

  for (const job of jobs) {
    const stored = readDeliverable(job.jobId);
    if (!stored) continue;
    let manifest: { response?: { content?: unknown }; metadata?: Record<string, unknown> };
    try {
      manifest = JSON.parse(stored.manifestText) as typeof manifest;
    } catch {
      continue;
    }
    const content = typeof manifest.response?.content === 'string' ? manifest.response.content : null;
    if (content === null) continue;
    const metadata = manifest.metadata ?? {};
    return {
      jobId: job.jobId,
      status: job.status,
      hiredAt: job.hiredAt,
      budgetRaw: job.budgetRaw,
      producer: typeof metadata.producer === 'string' ? metadata.producer : null,
      generatedAt: typeof metadata.generated_at === 'string' ? metadata.generated_at : null,
      providerLabel: job.providerLabel ?? null,
      manifestHash: keccak256(stringToBytes(stored.manifestText)),
      ...unpack(content),
    };
  }
  return null;
}
