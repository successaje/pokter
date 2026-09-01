import 'server-only';

import { getEcosystemStats, listSearchable } from '@/lib/marketplace';
import { getProbeStore } from '@/lib/history/store';
import { getSessionStore } from '@/lib/altana/store';
import { getJobStore } from '@/lib/erc8183/store';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';

/**
 * The hero pipeline.
 *
 * Every count, name and rejection reason below is read from the same sources
 * the rest of the product uses. The narrowing it depicts — hundreds of
 * thousands registered, a couple of dozen measured, a handful hirable — is the
 * actual shape of this registry, which is why it makes a better hero than a
 * busy marketplace would: the scarcity is the story.
 */

export interface PipelineStage {
  id: string;
  label: string;
  question: string;
  /** Agents remaining at this stage, or null when the figure is unknown. */
  count: number | null;
  /** A real agent that survived this far, for the travelling card. */
  passing: string | null;
  /** A real agent rejected here, with the reason we would actually give. */
  rejected: { name: string; reason: string } | null;
}

export type EventKind = 'verified' | 'evidence' | 'session' | 'escrow' | 'blocked';

export interface PipelineEvent {
  kind: EventKind;
  title: string;
  detail: string;
  /** Set when the event has an on-chain transaction behind it. */
  txHash?: string;
}

export interface PipelinePayload {
  stages: PipelineStage[];
  events: PipelineEvent[];
  /** The permission capsule shown wrapping the survivor. */
  capsule: { spend: string; expiry: string; venue: string } | null;
  survivor: { name: string; chainId: number; tokenId: string } | null;
}

export async function buildPipeline(): Promise<PipelinePayload> {
  const [stats, agents] = await Promise.all([
    getEcosystemStats(),
    listSearchable({ limit: 6 }),
  ]);

  const measured = agents.filter((a) => a.record.totalProbes > 0);
  const answering = measured.filter((a) => a.record.totalAnswered > 0);
  const withEvidence = answering.filter((a) => a.listing.attestationCount > 0);

  const dead = measured.find((a) => a.record.totalAnswered === 0);
  const unmeasured = agents.find((a) => a.record.totalProbes === 0);
  const noEndpoint = agents.find(
    (a) => (a.listing.agent.supported_protocols ?? []).length === 0,
  );
  const thin = answering.find((a) => a.listing.attestationCount === 0);

  const best = withEvidence[0] ?? answering[0] ?? null;

  // A different surviving agent per stage. Repeating one name down the whole
  // funnel reads as a rendering bug rather than as a population thinning out.
  const survivorAt = (pool: typeof agents, index: number) =>
    pool.length === 0 ? null : pool[index % pool.length].listing.agent.name;

  // How many agents Pokter has actually acted on, which is the true end of the
  // funnel — narrower than "could be hired", and the number that matters.
  const acted = new Set(
    getSessionStore()
      .all()
      .map((session) => `${session.agentChainId}:${session.agentTokenId}`),
  ).size;

  const stages: PipelineStage[] = [
    {
      id: 'discover',
      label: 'Discover',
      question: 'Which agents even do this job?',
      count: stats.registered,
      passing: survivorAt(agents, 0),
      rejected: noEndpoint
        ? {
            name: noEndpoint.listing.agent.name,
            reason: 'Publishes no endpoint',
          }
        : null,
    },
    {
      id: 'verify',
      label: 'Verify',
      question: 'Does it answer when called?',
      count: agents.length,
      passing: survivorAt(answering, 1),
      rejected: dead
        ? {
            name: dead.listing.agent.name,
            reason: `Answered none of ${dead.record.totalProbes} probes`,
          }
        : null,
    },
    {
      id: 'compare',
      label: 'Compare',
      question: 'Has anyone independent checked it?',
      count: measured.length,
      passing: survivorAt(withEvidence, 2),
      rejected: unmeasured
        ? {
            name: unmeasured.listing.agent.name,
            reason: 'No track record to judge on',
          }
        : thin
          ? { name: thin.listing.agent.name, reason: 'No independent attestation' }
          : null,
    },
    {
      id: 'permit',
      label: 'Permit',
      question: 'What exactly am I allowing it to do?',
      count: withEvidence.length,
      passing: survivorAt(withEvidence, 3),
      rejected: null,
    },
    {
      id: 'execute',
      label: 'Execute',
      question: 'What is it doing right now?',
      // Agents Pokter has actually granted a session to — the real end of the
      // funnel, and a much smaller number than "eligible".
      count: acted,
      passing: best?.listing.agent.name ?? null,
      rejected: null,
    },
  ];

  return {
    stages,
    events: recentEvents(agents),
    capsule: { spend: '0.05 BNB', expiry: '7 days', venue: 'PancakeSwap only' },
    survivor: best
      ? {
          name: best.listing.agent.name,
          chainId: best.listing.agent.chain_id,
          tokenId: best.listing.agent.token_id,
        }
      : null,
  };
}

/**
 * Live events, drawn from what actually happened.
 *
 * Per-agent rather than per-sweep. Summarising a sweep as one line threw away
 * the interesting part — that specific agents answered everything, and specific
 * others answered nothing — so each notable agent now produces its own event,
 * which is also what makes running more sweeps visibly enrich the scene.
 *
 * Notably absent: executed trades. No agent execution is attributable to
 * Pokter, so the ticker reports escrow being funded rather than inventing a
 * rebalance it never observed.
 */
function recentEvents(
  agents: Awaited<ReturnType<typeof listSearchable>>,
): PipelineEvent[] {
  const events: PipelineEvent[] = [];

  const sessions = getSessionStore().all();
  const jobs = getJobStore().all();
  const probeStats = getProbeStore().stats();

  // Agents holding up under repeated checking.
  const solid = agents
    .filter(
      (a) => a.record.totalProbes >= 8 && a.record.totalAnswered === a.record.totalProbes,
    )
    .slice(0, 3);

  for (const agent of solid) {
    events.push({
      kind: 'verified',
      title: 'Agent verified',
      detail: `${agent.listing.agent.name} · ${agent.record.totalProbes}/${agent.record.totalProbes} probes`,
    });
  }

  // Agents that answer nothing. These matter more than the healthy ones.
  const dead = agents
    .filter((a) => a.record.totalProbes > 0 && a.record.totalAnswered === 0)
    .slice(0, 2);

  for (const agent of dead) {
    events.push({
      kind: 'blocked',
      title: 'Hiring blocked',
      detail: `${agent.listing.agent.name} · 0/${agent.record.totalProbes} probes`,
    });
  }

  // Independent attestations, which are the scarcest signal we have.
  const attested = agents
    .filter((a) => a.listing.attestationCount > 0)
    .slice(0, 2);

  for (const agent of attested) {
    events.push({
      kind: 'evidence',
      title: 'New evidence',
      detail: `${agent.listing.agent.name} · ${agent.listing.attestationCount} attestation(s)`,
    });
  }

  for (const session of sessions.slice(0, 2)) {
    events.push(
      session.revokedAt
        ? {
            kind: 'blocked',
            title: 'Session revoked',
            detail: session.agentName,
            txHash: session.revokeTxHash ?? undefined,
          }
        : {
            kind: 'session',
            title: 'Session created',
            detail: `${Number(session.spendCapWei) / 1e18} BNB · ${session.period}`,
            txHash: session.grantTxHash ?? undefined,
          },
    );
  }

  for (const job of jobs.slice(0, 2)) {
    events.push({
      kind: 'escrow',
      title: 'Escrow funded',
      detail: `${Number(job.budgetRaw) / 1e18} $U · job #${job.jobId}`,
      txHash: job.hireTxHash ?? undefined,
    });
  }

  events.push({
    kind: 'verified',
    title: 'Sweep completed',
    detail: `${probeStats.probesAnswered}/${probeStats.probesTaken} probes across ${probeStats.sweeps} sweeps`,
  });

  // Interleave so the scene does not show three of the same kind in a row.
  return interleave(events);
}

/** Spread events so adjacent cards differ in kind where possible. */
function interleave(events: PipelineEvent[]): PipelineEvent[] {
  const byKind = new Map<EventKind, PipelineEvent[]>();
  for (const event of events) {
    byKind.set(event.kind, [...(byKind.get(event.kind) ?? []), event]);
  }

  const ordered: PipelineEvent[] = [];
  let remaining = events.length;

  while (remaining > 0) {
    for (const queue of byKind.values()) {
      const next = queue.shift();
      if (next) {
        ordered.push(next);
        remaining -= 1;
      }
    }
  }

  return ordered;
}

export const STAGE_META = CATEGORY_BY_ID;

/** One probe, as shown in the live-proof section. */
export interface ProbeLine {
  ok: boolean;
  latencyMs: number | null;
  detail: string;
  at: string;
  endpoint: string | null;
}

/**
 * The most recent probes, for showing the check itself rather than describing
 * it. These are transcripts, not samples: the latency and the response text are
 * what the endpoint actually returned.
 */
export function recentProbes(limit = 5): ProbeLine[] {
  return getProbeStore()
    .recent(limit)
    .map((probe) => ({
      ok: probe.ok,
      latencyMs: probe.latencyMs,
      detail: probe.detail,
      at: probe.probedAt,
      endpoint: probe.endpoint,
    }));
}
