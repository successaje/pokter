import 'server-only';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { fetchDeclaredCapabilities } from '@/lib/agents/agent-card';
import type { DeclaredSkill } from '@/lib/agents/capabilities';
import { deliveryTimes, type DeliveryTimes } from '@/lib/agent/delivery-times';
import { sampleDelivery, type SampleDelivery } from '@/lib/agent/sample-delivery';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { summariseEconomicHistory, type AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import { quotePayableWith } from '@/lib/erc8183/payable';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { providerChoicesFor } from '@/lib/erc8183/providers';
import { getJobStore } from '@/lib/erc8183/store';
import { stripCells, type StripCell } from '@/lib/history/strip';
import type { TrackRecord } from '@/lib/history/record';
import type { ProviderChoice } from '@/lib/hire/useHire';
import { loadDossier, recommendedAlternatives, suggestedBudgetFor, type AgentDossier } from '@/lib/marketplace';
import { VERDICT_LABEL, VERDICT_MEANING, type Verdict } from '@/lib/proof/engine';
import { summarisePublishedEvidence, type PublishedEvidenceSummary } from '@/lib/proof/published';
import { suggestionLabel, suggestionNote } from '@/lib/find/suggested';
import { getProbeStore } from '@/lib/history/store';
import { getReviewStore } from '@/lib/reviews/store';
import type { VerifiedReview } from '@/lib/reviews/model';
import type { ChainId } from '@/lib/scan/types';

/** Agent-provided text is untrusted: strip control characters and cap it. */
function clean(text: string | null | undefined, max = 4000) {
  return (text ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, max)
    .trim();
}

function firstSentence(text: string) {
  const plain = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  const match = plain.match(/^(.{20,220}?[.!?])(\s|$)/);
  return match ? match[1] : plain.slice(0, 200) + (plain.length > 200 ? '…' : '');
}

function httpsOnly(value: string | null | undefined) {
  const v = value?.trim();
  return v && /^https:\/\/[^\s]+$/i.test(v) ? v : null;
}

export interface AgentProfile {
  key: string;
  chainId: ChainId;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  summary: string;
  description: string;
  owner: string;
  agentWallet: string | null;
  createdAt: string | null;
  category: { id: string; label: string; question: string; blurb: string } | null;
  verdict: { id: Verdict; label: string; meaning: string; rationale: string; recommended: boolean };
  live: { answered: boolean; ratio: number | null; medianMs: number | null; protocol: string; endpoint: string | null; capabilities: string[] };
  record: { windows: TrackRecord['windows']; totalProbes: number; totalAnswered: number; firstSeen: string | null; lastSeen: string | null; observedDays: number; longestOutage: TrackRecord['longestOutage']; cells: StripCell[] };
  skills: DeclaredSkill[];
  /** Reply times of answered probes, oldest first, last 30 days. */
  latency: Array<{ at: string; ms: number }>;
  evidence: PublishedEvidenceSummary & { measurers: string[]; windowDays: number | null };
  defects: string[];
  score: { overall: number | null; measured: number; total: number; dimensions: Array<{ label: string; earned: number | null; weight: number; explanation: string }> };
  quote: { priceU: number; label: string; currency: string; signer: string; quotedAt: string; expiresAt: string | null; current: boolean; payable: boolean | null } | null;
  suggestion: { label: string; note: string; u: number } | null;
  providers: ProviderChoice[];
  deliveredByPokter: boolean;
  escrow: { chainId: number; paymentToken: string; commerce: string };
  history: AgentEconomicHistory;
  delivery: DeliveryTimes;
  sample: SampleDelivery | null;
  reviews: VerifiedReview[];
  services: Array<{ name: string; endpoint: string }>;
  repositoryUrl: string | null;
  warnings: string[];
  hireable: boolean;
  trialAvailable: boolean;
  alternatives: Array<{ key: string; chainId: number; tokenId: string; name: string; imageUrl: string | null; verdict: Verdict; answered: number; probes: number }>;
}

export type ProfileResult = { state: 'ok'; profile: AgentProfile } | { state: 'missing' } | { state: 'unreachable' };

const DIMENSION_LABEL: Record<string, string> = {
  performance: 'Performance',
  reliability: 'Reliability',
  evidence: 'Evidence',
  risk: 'Risk',
  efficiency: 'Efficiency',
};

export async function loadProfile(chainId: ChainId, tokenId: string): Promise<ProfileResult> {
  const result = await loadDossier(chainId, tokenId);
  if (result.state !== 'ok') return result;
  return { state: 'ok', profile: await toProfile(result.dossier) };
}

async function toProfile(d: AgentDossier): Promise<AgentProfile> {
  const { agent, category, attestations, proof, live, record, score } = d;
  const meta = category === 'unclassified' ? null : (CATEGORY_BY_ID.get(category) ?? null);
  const escrowChain = ALTANA_NETWORK.chainId;
  const addresses = correctedErc8183Addresses(escrowChain);

  const [skills, delivery, providers, suggestion, alternatives] = await Promise.all([
    fetchDeclaredCapabilities(agent.services?.a2a?.endpoint, agent.token_id).catch(() => []),
    deliveryTimes(agent.chain_id, agent.token_id).catch(() => ({ samples: 0, medianMs: null, fastestMs: null, slowestMs: null, onTime: null })),
    providerChoicesFor(agent, escrowChain, d.quote).catch(() => [] as ProviderChoice[]),
    d.quote || category === 'unclassified' ? Promise.resolve(null) : suggestedBudgetFor(category, { chainId: agent.chain_id as ChainId }).catch(() => null),
    category === 'unclassified' ? Promise.resolve([]) : recommendedAlternatives(category, agent.token_id, 3).catch(() => []),
  ]);

  const payable = d.quote ? quotePayableWith(d.quote.currency, addresses.paymentToken) : null;
  const answeredNow = live.ratio !== null && live.ratio > 0;
  const published = summarisePublishedEvidence(attestations);

  const warnings = [
    ...(!proof.recommendedForHire ? [proof.rationale] : []),
    ...(!answeredNow ? ['It did not answer Pokter’s live check when this page loaded.'] : []),
    ...(payable === false ? ['Its signed price is in a token this escrow cannot pay, so a funded job could not be accepted by the seller.'] : []),
  ];

  const services = Object.entries(agent.services ?? {})
    .map(([name, service]) => ({ name, endpoint: clean(service?.endpoint, 400) }))
    .filter((s) => s.endpoint);

  const description = clean(agent.description);
  const suggested = suggestion ? { label: suggestionLabel(suggestion), note: suggestionNote(suggestion, meta?.label), u: suggestion.u } : null;

  return {
    key: `${agent.chain_id}:${agent.token_id}`,
    chainId: agent.chain_id as ChainId,
    tokenId: agent.token_id,
    name: clean(agent.name, 120) || `Agent #${agent.token_id}`,
    imageUrl: httpsOnly(agent.image_url),
    summary: description ? firstSentence(description) : 'This agent has not published a description.',
    description,
    owner: agent.owner_address,
    agentWallet: agent.agent_wallet ?? null,
    createdAt: agent.created_at ?? null,
    category: meta ? { id: meta.id, label: meta.label, question: meta.question, blurb: meta.blurb } : null,
    verdict: { id: proof.verdict, label: VERDICT_LABEL[proof.verdict], meaning: VERDICT_MEANING[proof.verdict], rationale: proof.rationale, recommended: proof.recommendedForHire },
    live: { answered: answeredNow, ratio: live.ratio, medianMs: live.medianMs, protocol: live.protocol, endpoint: live.endpoint, capabilities: live.capabilities.slice(0, 20) },
    record: {
      windows: record.windows,
      totalProbes: record.totalProbes,
      totalAnswered: record.totalAnswered,
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen,
      observedDays: record.observedDays,
      longestOutage: record.longestOutage,
      cells: stripCells(record, 30),
    },
    latency: getProbeStore()
      .historyFor(agent.chain_id, agent.token_id, new Date(Date.now() - 30 * 86_400_000))
      .filter((p) => p.ok && p.latencyMs !== null)
      .slice(0, 40)
      .reverse()
      .map((p) => ({ at: p.probedAt, ms: p.latencyMs as number })),
    skills: skills.slice(0, 12).map((s) => ({ name: clean(s.name, 80), description: s.description ? clean(s.description, 300) : null })),
    evidence: { ...published, measurers: proof.measurers, windowDays: proof.windowDays },
    defects: [...new Set([...(live.method.knownDefects ?? []), ...proof.disclosedDefects])],
    score: {
      overall: score.measuredDimensions > 0 ? score.overall : null,
      measured: score.measuredDimensions,
      total: score.totalDimensions,
      dimensions: score.dimensions.map((dim) => ({
        label: DIMENSION_LABEL[dim.dimension] ?? dim.dimension,
        earned: dim.earned,
        weight: dim.weight,
        explanation: dim.explanation,
      })),
    },
    quote: d.quote
      ? {
          priceU: Number(d.quote.priceU),
          label: formatQuotedPrice(Number(d.quote.priceU)),
          currency: d.quote.currency,
          signer: d.quote.signer,
          quotedAt: d.quote.quotedAt,
          expiresAt: d.quote.expiresAt ?? null,
          current: d.quoteCurrent,
          payable,
        }
      : null,
    suggestion: suggested,
    providers,
    deliveredByPokter: agent.chain_id !== escrowChain,
    escrow: { chainId: escrowChain, paymentToken: addresses.paymentToken, commerce: addresses.commerce },
    history: summariseEconomicHistory(getJobStore().byAgent(agent.chain_id, agent.token_id)),
    delivery,
    sample: sampleDelivery(agent.chain_id, agent.token_id),
    reviews: getReviewStore().byAgent(agent.chain_id, agent.token_id).filter((r) => r.visibility !== 'hidden'),
    services,
    repositoryUrl: httpsOnly(services.find((s) => s.name.toLowerCase() === 'repository')?.endpoint),
    warnings,
    hireable: providers.length > 0,
    trialAvailable: live.protocol === 'a2a' && answeredNow,
    alternatives: alternatives.map((alt) => ({
      key: `${alt.listing.agent.chain_id}:${alt.listing.agent.token_id}`,
      chainId: alt.listing.agent.chain_id,
      tokenId: alt.listing.agent.token_id,
      name: alt.listing.agent.name,
      imageUrl: httpsOnly(alt.listing.agent.image_url),
      verdict: alt.verdict,
      answered: alt.answered,
      probes: alt.probes,
    })),
  };
}
