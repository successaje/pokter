import 'server-only';

import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { summariseEconomicHistory, type AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import type { HiredJob } from '@/lib/erc8183/types';
import { deliveryKind } from './delivery-kind';

/*
 * A delivered manifest never changes, so a job's classification is read once.
 * Jobs with no hosted manifest are the agent's own deliveries (it hosts them),
 * or not delivered at all: neither is a demonstration.
 */
const known = new Map<string, boolean>();

export function isLifecycleDemo(job: HiredJob): boolean {
  if (job.status !== 'SUBMITTED' && job.status !== 'COMPLETED') return false;
  const key = `${job.chainId}:${job.jobId}`;
  const cached = known.get(key);
  if (cached !== undefined) return cached;
  let demo = false;
  const stored = readDeliverable(deliverableKey(job.chainId, job.jobId));
  if (stored) {
    try {
      const manifest = JSON.parse(stored.manifestText) as { response?: { content?: unknown }; metadata?: { producer?: unknown } };
      const producer = typeof manifest.metadata?.producer === 'string' ? manifest.metadata.producer : null;
      const raw = manifest.response?.content;
      let content: unknown = raw;
      if (typeof raw === 'string') {
        try {
          content = JSON.parse(raw);
        } catch {
          content = null;
        }
      }
      demo = deliveryKind(producer, content) === 'lifecycle';
    } catch {
      demo = false;
    }
  }
  known.set(key, demo);
  return demo;
}

/**
 * An agent's record from its jobs, crediting only work the agent did.
 *
 * Every page and API that reports an agent's deliveries, acceptances,
 * misses or buyers reads it through this, so a lifecycle demonstration
 * Pokter's seller closed can never become the agent's accepted work on one
 * page while another calls it a demonstration.
 */
export function agentHistory(jobs: HiredJob[], now = Date.now()): AgentEconomicHistory {
  return summariseEconomicHistory(jobs, now, { isLifecycleDemo });
}
