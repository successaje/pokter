import 'server-only';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { fetchDeclaredCapabilities } from '@/lib/agents/agent-card';
import type { DeclaredSkill } from '@/lib/agents/capabilities';
import { deliveryTimes, type DeliveryTimes } from '@/lib/agent/delivery-times';
import { sampleDelivery, type SampleDelivery } from '@/lib/agent/sample-delivery';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { escrowOptionsForHire, isEscrowChain } from '@/lib/network/escrow';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import type { AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import { agentHistory } from '@/lib/agent/credited-history';
import { deliveryAdjustedVerdict } from '@/lib/search/match';
import { getAssayStore, type AssayRun } from '@/lib/assay/store';
import { assayForCategory, type AssayDefinition } from '@/lib/assay/catalog';
import { quotePayableWith, unpayablePriceNote } from '@/lib/erc8183/payable';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { providerChoicesFor } from '@/lib/erc8183/providers';
import { getJobStore } from '@/lib/erc8183/store';
import { stripCells, type StripCell } from '@/lib/history/strip';
import type { TrackRecord } from '@/lib/history/record';
import type { ProviderChoice } from '@/lib/hire/useHire';
import { loadDossier, recommendedAlternatives, suggestedBudgetFor, type AgentDossier } from '@/lib/marketplace';
import { resolveAgentImage, resolveAgentImages } from '@/lib/registry/image';
import { VERDICT_LABEL, VERDICT_MEANING, type Verdict } from '@/lib/proof/engine';
import { summarisePublishedEvidence, type PublishedEvidenceSummary } from '@/lib/proof/published';
import { suggestionLabel, suggestionNote } from '@/lib/find/suggested';
import { getProbeStore } from '@/lib/history/store';
import { getReviewStore } from '@/lib/reviews/store';
import type { VerifiedReview } from '@/lib/reviews/model';
import type { ChainId } from '@/lib/scan/types';
import { deriveMaturity, type AgentMaturity } from '@/lib/agents/maturity';

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
  maturity: AgentMaturity;
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
  /** Every escrow this agent can be hired on, preferred first; `escrow` is one of them. */
  escrowOptions: number[];
  history: AgentEconomicHistory;
  delivery: DeliveryTimes;
  sample: SampleDelivery | null;
  reviews: VerifiedReview[];
  /** The latest category-specific correctness check and its published scope. */
  categoryCheck: { definition: AssayDefinition; run: AssayRun | null } | null;
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

/**
 * `escrow` asks for a hire on a particular escrow (the hire page's `?escrow=`).
 * It is honoured only when the agent can be hired there; otherwise the
 * preferred escrow is used.
 */
export async function loadProfile(chainId: ChainId, tokenId: string, options: { escrow?: number | null } = {}): Promise<ProfileResult> {
  const result = await loadDossier(chainId, tokenId);
  if (result.state !== 'ok') return result;
  return { state: 'ok', profile: await toProfile(result.dossier, options.escrow ?? null) };
}

async function toProfile(d: AgentDossier, requestedEscrow: number | null): Promise<AgentProfile> {
  const { agent, category, attestations, proof, live, record, score } = d;
  const meta = category === 'unclassified' ? null : (CATEGORY_BY_ID.get(category) ?? null);
  // The escrow that can pay this agent's signed price, with testnet offered
  // as a free trial; or the default escrow when none can (the page then says
  // why it cannot be hired at that price).
  const escrowOptions: number[] = escrowOptionsForHire(d.quote?.currency);
  const escrowChain =
    requestedEscrow !== null && escrowOptions.includes(requestedEscrow)
      ? requestedEscrow
      : (escrowOptions[0] ?? ALTANA_NETWORK.chainId);
  // On testnet, an agent whose price is for mainnet is reached by Pokter's
  // delivery agent, so its price is not the one being paid.
  const testnetTrial = escrowChain === 97 && escrowOptions.includes(56);
  const addresses = correctedErc8183Addresses(escrowChain);

  const [skills, delivery, providers, suggestion, alternatives, imageUrl] = await Promise.all([
    fetchDeclaredCapabilities(agent.services?.a2a?.endpoint, agent.token_id).catch(() => []),
    deliveryTimes(agent.chain_id, agent.token_id).catch(() => ({ samples: 0, medianMs: null, fastestMs: null, slowestMs: null, onTime: null })),
    providerChoicesFor(agent, escrowChain, d.quote).catch(() => [] as ProviderChoice[]),
    d.quote || category === 'unclassified' ? Promise.resolve(null) : suggestedBudgetFor(category, { chainId: agent.chain_id as ChainId }).catch(() => null),
    category === 'unclassified' ? Promise.resolve([]) : recommendedAlternatives(category, agent.token_id, 3).catch(() => []),
    resolveAgentImage(agent.chain_id, agent.token_id, agent.image_url).catch(() => httpsOnly(agent.image_url)),
  ]);

  /* The alternatives carry images too, and were reading the indexer
     alone — three more rows on a page that already reads the registry for
     the agent it is about. */
  const alternativeImages = await resolveAgentImages(alternatives.map((alt) => alt.listing.agent));

  const payable = d.quote ? quotePayableWith(d.quote.currency, addresses.paymentToken) : null;
  const answeredNow = live.ratio !== null && live.ratio > 0;
  const published = summarisePublishedEvidence(attestations);

  // The same rule the catalogue's verdict applies (`verdictFor`): answering
  // probes does not make an agent reliable while it lets paid jobs lapse.
  const history = agentHistory(getJobStore().byAgent(agent.chain_id, agent.token_id));
  const assayDefinition = assayForCategory(category);
  const categoryCheck = assayDefinition
    ? { definition: assayDefinition, run: getAssayStore().latest({ chainId: agent.chain_id, tokenId: agent.token_id }, assayDefinition.id) }
    : null;
  const maturity = deriveMaturity({
    registered: true,
    reachable: record.totalAnswered > 0,
    compatible: record.totalAnswered > 0 && escrowOptions.length > 0 && payable !== false,
    tested: Boolean(categoryCheck?.run && categoryCheck.run.status === 'checked' && categoryCheck.run.total > 0 && categoryCheck.run.passed === categoryCheck.run.total),
    hired: history.jobs > 0,
    delivered: history.selfDelivered > 0,
    deliveredByOperator: history.operatorDelivered > 0,
    outsideTeam: history.outsideTeam,
    probeRate: record.totalProbes > 0 ? record.totalAnswered / record.totalProbes : null,
    observedDays: record.observedDays,
  });
  const adjusted = deliveryAdjustedVerdict(proof.verdict, history);
  const verdict = adjusted.verdict;
  const verdictRationale = adjusted.note ? `${proof.rationale} ${adjusted.note}` : proof.rationale;

  const warnings = [
    ...(!proof.recommendedForHire ? [proof.rationale] : []),
    ...(!answeredNow ? ['It did not answer Pokter’s live check when this page loaded.'] : []),
    ...(live.requiresAuth
      ? ['Its agent card says the endpoint needs credentials, so Pokter cannot carry your task to it or tell it a job is funded. Unless it watches the escrow itself, a paid job may expire undelivered.']
      : []),
    ...(payable === false && d.quote && !testnetTrial ? [unpayablePriceNote(d.quote.currency, !isEscrowChain(56))] : []),
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
    imageUrl,
    summary: description ? firstSentence(description) : 'This agent has not published a description.',
    description,
    owner: agent.owner_address,
    agentWallet: agent.agent_wallet ?? null,
    createdAt: agent.created_at ?? null,
    category: meta ? { id: meta.id, label: meta.label, question: meta.question, blurb: meta.blurb } : null,
    verdict: { id: verdict, label: VERDICT_LABEL[verdict], meaning: VERDICT_MEANING[verdict], rationale: verdictRationale, recommended: proof.recommendedForHire },
    maturity,
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
    skills: skills.slice(0, 12).map((s) => ({
      name: clean(s.name, 80),
      description: s.description ? clean(s.description, 300) : null,
      /* Carried through: the hire page builds its task suggestions from
         these, so an agent that documents how to ask it gets asked that
         way. See `templatesFromSkills`. */
      examples: s.examples.map((example) => clean(example, 200)).filter(Boolean),
    })),
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
    escrowOptions,
    history,
    delivery,
    sample: sampleDelivery(agent.chain_id, agent.token_id),
    reviews: getReviewStore().byAgent(agent.chain_id, agent.token_id).filter((r) => r.visibility !== 'hidden'),
    categoryCheck,
    services,
    repositoryUrl: httpsOnly(services.find((s) => s.name.toLowerCase() === 'repository')?.endpoint),
    warnings,
    hireable: providers.length > 0,
    trialAvailable: live.protocol === 'a2a' && answeredNow,
    alternatives: alternatives.map((alt, i) => ({
      key: `${alt.listing.agent.chain_id}:${alt.listing.agent.token_id}`,
      chainId: alt.listing.agent.chain_id,
      tokenId: alt.listing.agent.token_id,
      name: alt.listing.agent.name,
      imageUrl: alternativeImages[i],
      verdict: alt.verdict,
      answered: alt.answered,
      probes: alt.probes,
    })),
  };
}
