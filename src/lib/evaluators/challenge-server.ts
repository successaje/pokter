import 'server-only';

import { getAddress } from 'viem';

import { isFeaturableAgent } from '@/lib/agents/eligibility';
import { mapWithConcurrency } from '@/lib/concurrency';
import { getFunderStore } from '@/lib/funding/store';
import { operatorResolver } from '@/lib/funding/operator';
import { listSearchableWithStatus } from '@/lib/marketplace';
import { resolveAttestationAuthors } from '@/lib/proof/attestation-authors';
import { toAttestation } from '@/lib/proof/attestation';
import { summariseProof } from '@/lib/proof/engine';
import { probeTarget } from '@/lib/proof/prober';
import { registryOwner } from '@/lib/registry/onchain';
import { getAgent, listFeedbacks } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { evaluatorStarterCommand, selectEvaluationQueue, type EvaluationQueueFacts } from './challenge';

export interface EvaluationChallengeEntry {
  key: string;
  chainId: ChainId;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  category: string;
  endpoint: string;
  protocol: 'a2a' | 'mcp';
  starterCommand: string;
  independentAuthors: string[];
  independentNeeded: number;
  publishedReceipts: number;
  scorableReceipts: number;
  probes: number;
  answered: number;
  delivered: number;
  outsideTeamCompleted: number;
  outsideTeamBuyers: number;
  priceU: number | null;
}

export interface EvaluationChallenge {
  entries: EvaluationChallengeEntry[];
  unreachable: boolean;
  observedAt: string;
  rule: string;
}

const CACHE_MS = 5 * 60_000;
let cached: { at: number; value: EvaluationChallenge } | null = null;

function factsOf(entry: Awaited<ReturnType<typeof listSearchableWithStatus>>['entries'][number]): EvaluationQueueFacts {
  return {
    key: `${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`,
    chainId: entry.listing.agent.chain_id,
    tokenId: entry.listing.agent.token_id,
    owner: entry.listing.agent.owner_address,
    // Featured as a work queue, so the bar is a readable name as well.
    promotable: isFeaturableAgent(entry.listing.agent),
    hasProtocol: (entry.listing.agent.supported_protocols?.length ?? 0) > 0,
    requiresAuth: entry.listing.requiresAuth === true,
    quotePayable: entry.listing.quotePayable === true,
    probes: entry.record.totalProbes,
    answered: entry.record.totalAnswered,
    delivered: entry.history.delivered,
    outsideTeamCompleted: entry.history.outsideTeam.completed,
    outsideTeamBuyers: entry.history.outsideTeam.uniqueBuyers,
  };
}

async function enrich(
  candidate: EvaluationQueueFacts,
  source: Awaited<ReturnType<typeof listSearchableWithStatus>>['entries'][number],
): Promise<EvaluationChallengeEntry | null> {
  const agent = await getAgent(56, candidate.tokenId).catch(() => null);
  if (!agent) return null;
  const target = probeTarget(agent);
  if (!target || !target.endpoint.startsWith('https://')) return null;

  const feedback = agent.total_feedbacks > 0
    ? await listFeedbacks({ chainId: 56, agentId: agent.id, limit: 50 }).catch(() => ({ items: [], total: 0, limit: 0, offset: 0 }))
    : { items: [], total: 0, limit: 0, offset: 0 };
  const owner = feedback.items.length > 0
    ? await registryOwner(56, candidate.tokenId).catch(() => agent.owner_address)
    : agent.owner_address;
  const authors = await resolveAttestationAuthors(56, owner, feedback.items);
  const attestations = feedback.items.map((row) => toAttestation(row, authors.get(row.id)));
  const proof = summariseProof(attestations);
  const independentAuthors = proof.measurers.map((address) => getAddress(address));

  return {
    key: candidate.key,
    chainId: 56,
    tokenId: candidate.tokenId,
    name: agent.name,
    imageUrl: agent.image_url ?? null,
    category: source.listing.category,
    endpoint: target.endpoint,
    protocol: target.protocol,
    starterCommand: evaluatorStarterCommand({ chainId: 56, tokenId: candidate.tokenId, ...target }),
    independentAuthors,
    independentNeeded: Math.max(0, 2 - independentAuthors.length),
    publishedReceipts: feedback.total,
    scorableReceipts: attestations.filter((attestation) => attestation.verified && attestation.ratio !== null).length,
    probes: candidate.probes,
    answered: candidate.answered,
    delivered: candidate.delivered,
    outsideTeamCompleted: candidate.outsideTeamCompleted,
    outsideTeamBuyers: candidate.outsideTeamBuyers,
    priceU: source.listing.quotePayable === true ? source.listing.quote?.priceU ?? null : null,
  };
}

export async function loadEvaluationChallenge(): Promise<EvaluationChallenge> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const result = await listSearchableWithStatus({ chainId: 56, limit: 400 });
  const byKey = new Map(result.entries.map((entry) => [`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`, entry]));
  const owners = result.entries.map((entry) => entry.listing.agent.owner_address);
  const operatorOf = operatorResolver(owners, getFunderStore().funders(owners));
  // Overfetch four beyond the eight visible places so already-corroborated
  // agents can fall out without verifying the whole catalogue on a cold read.
  const candidates = selectEvaluationQueue(result.entries.map(factsOf), operatorOf, 12);
  const enriched = await mapWithConcurrency(candidates, 6, async (candidate) => {
    const source = byKey.get(candidate.key);
    return source ? enrich(candidate, source) : null;
  });

  const value: EvaluationChallenge = {
    entries: enriched
      .filter((entry): entry is EvaluationChallengeEntry => entry !== null && entry.independentNeeded > 0)
      .slice(0, 8),
    unreachable: result.unreachable,
    observedAt: new Date().toISOString(),
    rule: 'Mainnet agents only; protocol endpoint published; answered Pokter probes; public access; promotable identity; one listing per observable operator. Independent counts use scorable receipts and feedback transaction senders.',
  };
  cached = { at: Date.now(), value };
  return value;
}
