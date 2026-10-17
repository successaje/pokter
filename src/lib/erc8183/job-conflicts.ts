import type { DatabaseSync } from 'node:sqlite';
import { getAddress } from 'viem';

import { decodePokterJobEnvelope } from './job-envelope';

/**
 * Adjudicate the duplicate job rows the store set aside, against the chain.
 *
 * The migration in `store.ts` keeps one row per job and quarantines the
 * rest, but it runs at boot with no network, so it cannot know which copy
 * told the truth: for job 97/1522 the two rows named different agents and
 * only the chain could say which. This can, and it is the only safe
 * repair — re-indexing the job through `/api/jobs/index` would fix the
 * agent but overwrite the hire time, the deliverable link and the settle
 * hash, none of which the chain re-read supplies.
 *
 * Takes the database and a reader rather than importing either, so one
 * implementation serves the operator route and a script run against a
 * copy of the database, and there is no second copy of this rule to drift.
 */

export interface OnchainJob {
  provider: string;
  description: string | null;
}

export type JobReader = (chainId: number, jobId: string) => Promise<OnchainJob>;

export interface ConflictOutcome {
  chainId: number;
  jobId: string;
  /** What changed, or why nothing did. */
  state: 'agreed' | 'corrected' | 'would-correct' | 'unreadable' | 'no-survivor';
  detail?: string;
  wasProvider?: string;
  nowProvider?: string;
  wasAgent?: string;
  nowAgent?: string;
}

interface KeptRow {
  id: string;
  agent_token_id: string;
  provider: string;
}

/**
 * Compare every set-aside row's job against the chain, and correct the
 * survivor where they disagree.
 *
 * Only the fields the chain is authoritative about are written: the
 * provider the escrow names, and the agent the job's own Pokter envelope
 * names. Everything else in the row is whatever was recorded, because
 * nothing here knows better.
 */
export async function adjudicateJobConflicts(
  db: DatabaseSync,
  read: JobReader,
  { apply = false }: { apply?: boolean } = {},
): Promise<ConflictOutcome[]> {
  const conflicts = db
    .prepare('SELECT id, chain_id, job_id, row_json FROM job_row_conflicts ORDER BY chain_id, CAST(job_id AS INTEGER)')
    .all() as { id: string; chain_id: number; job_id: string; row_json: string }[];

  const outcomes: ConflictOutcome[] = [];
  for (const conflict of conflicts) {
    const base = { chainId: conflict.chain_id, jobId: conflict.job_id };
    const kept = db
      .prepare('SELECT id, agent_token_id, provider FROM jobs WHERE chain_id = ? AND job_id = ?')
      .get(conflict.chain_id, conflict.job_id) as KeptRow | undefined;
    if (!kept) {
      outcomes.push({ ...base, state: 'no-survivor', detail: 'no row survives for this job' });
      continue;
    }

    let onchain: OnchainJob;
    try {
      onchain = await read(conflict.chain_id, conflict.job_id);
    } catch (error) {
      outcomes.push({ ...base, state: 'unreadable', detail: (error as Error).message.split('\n')[0] });
      continue;
    }

    const trueProvider = getAddress(onchain.provider as `0x${string}`);
    const trueAgent = decodePokterJobEnvelope(onchain.description ?? '')?.identity?.tokenId ?? null;
    const providerWrong = getAddress(kept.provider as `0x${string}`) !== trueProvider;
    const agentWrong = trueAgent !== null && kept.agent_token_id !== trueAgent;

    if (!providerWrong && !agentWrong) {
      outcomes.push({ ...base, state: 'agreed' });
      continue;
    }

    const outcome: ConflictOutcome = {
      ...base,
      state: apply ? 'corrected' : 'would-correct',
      ...(providerWrong ? { wasProvider: kept.provider, nowProvider: trueProvider } : {}),
      ...(agentWrong ? { wasAgent: kept.agent_token_id, nowAgent: trueAgent! } : {}),
    };
    if (apply) {
      db.prepare('UPDATE jobs SET provider = ?, agent_token_id = COALESCE(?, agent_token_id) WHERE id = ?')
        .run(trueProvider, trueAgent, kept.id);
    }
    outcomes.push(outcome);
  }
  return outcomes;
}
