import 'server-only';

import { CATEGORY_BY_ID, categorySignalSource } from '@/lib/agents/categories';
import { readCardForPage } from '@/lib/agents/agent-card';
import { mcpCapabilities, type DeclaredSkill } from '@/lib/agents/capabilities';
import { deliveryTimes, type DeliveryTimes } from '@/lib/agent/delivery-times';
import { sampleDelivery, type SampleDelivery } from '@/lib/agent/sample-delivery';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { escrowOptionsForHire, isEscrowChain } from '@/lib/network/escrow';
import { ownRegistration } from '@/lib/agents/own-registration';
import { relayStatus, type RelayStatus } from '@/lib/erc8183/relay-refusal';
import { probeRelay } from '@/lib/erc8183/relay-probe';
import { onChainSummary, type OnChainKind } from '@/lib/capability/match';
import { getCapabilityStore } from '@/lib/capability/store';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import type { AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import { deliveryAdjustedVerdict } from '@/lib/search/match';
import type { AssayRun } from '@/lib/assay/store';
import type { AssayDefinition } from '@/lib/assay/catalog';
import { unpayablePriceNote } from '@/lib/erc8183/payable';
import { tokenLabel } from '@/lib/erc8183/pricing';
import { quotePriceLabel } from '@/lib/find/price';
import { jobAmountLabel } from '@/lib/erc8183/job-amount';
import { displaySymbol, offeredTokens, paymentTokenAt, settlementChainOf } from '@/lib/network/tokens';
import { providerChoicesFor } from '@/lib/erc8183/providers';
import { daysSinceLastAnswer, stripCells, type StripCell } from '@/lib/history/strip';
import type { TrackRecord } from '@/lib/history/record';
import type { ProviderChoice } from '@/lib/hire/useHire';
import { loadDossier, recommendedAlternatives, suggestedBudgetFor, type AgentDossier } from '@/lib/marketplace';
import { resolveAgentImage, resolveAgentImages } from '@/lib/registry/image';
import { AVAILABILITY_LABEL, VERDICT_MEANING, type Verdict } from '@/lib/proof/engine';
import { summarisePublishedEvidence, type PublishedEvidenceSummary } from '@/lib/proof/published';
import { suggestionLabel, suggestionNote } from '@/lib/find/suggested';
import { getProbeStore } from '@/lib/history/store';
import { endpointReading } from '@/lib/compare/rows';
import { getJobStore } from '@/lib/erc8183/store';
import { escrowCommerceAddress } from '@/lib/erc8183/addresses';
import { jobReceipt } from '@/lib/jobs/receipt-link';
import { teamAddressSet } from '@/lib/team/wallets';
import { getReviewStore } from '@/lib/reviews/store';
import type { VerifiedReview } from '@/lib/reviews/model';
import type { ChainId } from '@/lib/scan/types';
import type { AgentMaturity } from '@/lib/agents/maturity';
import { dossierLadder } from '@/lib/agents/dossier-ladder';
import { readinessRows, type ReadinessRow } from '@/lib/agents/readiness';
import { chainLabel } from '@/lib/network/presentation';
import type { HireBlocker, PriceCheckSource } from '@/lib/hire/blocker';
import { currentHireBlocker, currentPriceCheck } from '@/lib/hire/blocker-live';
import { clipAtWord } from '@/lib/ui/clip';
import { agentReadings, type PlatformBenchmark } from '@/lib/benchmark/platform';
import { currentPlatformBenchmark } from '@/lib/benchmark/platform-server';
import { registeredAgentWallet } from '@/lib/registry/live-agent';

/** Agent-provided text is untrusted: strip control characters and cap it. */
function clean(text: string | null | undefined, max = 4000) {
  return clipAtWord((text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim(), max);
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
  /**
   * The category, and what put the agent in it.
   *
   * `blurb` describes the category, not this agent. The page printed it
   * under "What it does", so Centreline — a concentrated-liquidity position
   * service the classifier placed in rebalancing — told every reader it
   * "reports how far your weights have drifted". `source` is how the
   * category was reached, so a blurb can be attributed to whoever earned
   * it: the operator's own tag, or Pokter reading their prose.
   */
  category: { id: string; label: string; question: string; blurb: string; source: 'declared' | 'name' | 'description' | null } | null;
  verdict: { id: Verdict; label: string; meaning: string; rationale: string; recommended: boolean };
  maturity: AgentMaturity;
  live: { answered: boolean; ratio: number | null; medianMs: number | null; protocol: string; endpoint: string | null; capabilities: string[] };
  /**
   * Days since the last answered check, or null if one never has.
   *
   * The same measurement the catalogue cards draw their answer dot from,
   * through the same function, so the dot here cannot say something
   * different from the dot on the card that led to this page.
   * `record.lastSeen` is the last day Pokter called, which is not it.
   */
  sinceAnswer: number | null;
  /**
   * The newest scheduled check: when it ran and what it found. Each sweep
   * checks a share of the roster, so freshness is said per agent rather
   * than as one time for every agent.
   */
  lastCheck: { at: string; reading: string; answered: boolean } | null;
  record: { windows: TrackRecord['windows']; totalProbes: number; totalAnswered: number; firstSeen: string | null; lastSeen: string | null; observedDays: number; longestOutage: TrackRecord['longestOutage']; cells: StripCell[] };
  skills: DeclaredSkill[];
  /**
   * Where `skills` came from: an A2A agent card, or the tool list the
   * prober read from an MCP endpoint. Null when there are none. The page
   * words the section from this, because "declared on its card" is false
   * for an agent that has no card.
   */
  skillSource: 'card' | 'mcp' | null;
  /** Reply times of answered probes, oldest first, last 30 days. */
  latency: Array<{ at: string; ms: number }>;
  evidence: PublishedEvidenceSummary & { measurers: string[]; windowDays: number | null };
  defects: string[];
  defectsByMeasurer: Array<{ measurer: string; defects: string[] }>;
  score: { overall: number | null; measured: number; total: number; dimensions: Array<{ label: string; earned: number | null; weight: number; explanation: string }> };
  /**
   * The last signed price. `priceU` is the number in the quote's own token
   * (`symbol`), not necessarily $U; `priceRaw` is the signed amount exact,
   * in that token's base units. `symbol` is null for a token Pokter has not
   * verified, which the page says rather than guesses.
   */
  quote: { priceU: number; priceRaw: string; label: string; currency: string; symbol: string | null; settlementChainId: number | null; signer: string; quotedAt: string; expiresAt: string | null; current: boolean; payable: boolean | null } | null;
  /**
   * Which money this agent signs prices in, as observed — never as assumed.
   *
   * Pokter keeps one signed quote per agent, so today this lists at most
   * one currency. It is a list because a hire is funded in the currency the
   * agent signs, and an agent seen signing in two would have to be shown
   * as two, not averaged into one. Null when it has never signed a price.
   */
  pricesIn: { currencies: Array<{ address: string; symbol: string }>; sentence: string } | null;
  /** The tokens the hire escrow (`escrow.chainId`) offers, $U first. A quote in any other token cannot be funded there. */
  escrowTokens: Array<{ address: string; symbol: string }>;
  suggestion: { label: string; note: string; u: number } | null;
  providers: ProviderChoice[];
  deliveredByPokter: boolean;
  escrow: { chainId: number; paymentToken: string; commerce: string };
  /** Every escrow this agent can be hired on, preferred first; `escrow` is one of them. */
  escrowOptions: number[];
  history: AgentEconomicHistory;
  /**
   * The funded jobs behind the counts above, newest first.
   *
   * The tab reported five totals and showed none of the work they came
   * from, so "2 of 3 delivered" could not be checked against anything
   * without leaving the page. Each row carries the job id the escrow
   * knows it by, so a reader can verify any of them on chain.
   */
  jobHistory: Array<{
    chainId: number;
    jobId: string;
    status: string;
    /**
     * The escrowed amount in the job's own token, e.g. "0.5 USDT", or a
     * base-unit amount marked unread when the job's token is not yet known.
     * Never a $U figure by default: a USDT job is not a $U one.
     */
    amountLabel: string;
    /** The token the escrow holds for this job; null until it is read. */
    paymentToken: string | null;
    hiredAt: string;
    delivered: boolean;
    /** A Pokter wallet was the provider: the work is Pokter's, not the agent's. */
    byOperator: boolean;
    /** Where this row can be checked on chain, and whether that is a transaction. */
    receipt: { href: string; hash: string | null };
  }>;
  delivery: DeliveryTimes;
  sample: SampleDelivery | null;
  /** What is typical on Pokter, and this agent's own readings by the same rules (`lib/benchmark/platform`). Null when it could not be read in time. */
  benchmark: { platform: PlatformBenchmark; own: ReturnType<typeof agentReadings> } | null;
  reviews: VerifiedReview[];
  /** The latest category-specific correctness check and its published scope. */
  categoryCheck: { definition: AssayDefinition; run: AssayRun | null } | null;
  services: Array<{ name: string; endpoint: string }>;
  repositoryUrl: string | null;
  warnings: string[];
  /** Probe rows excluded as Pokter's own measurement error, by reason. */
  corrections: Array<{ rule: string; reason: string; count: number }>;
  /**
   * Why it cannot be priced or hired right now, from the latest sweep's
   * price request, for its owner to act on. Null when it has a payable
   * signed price, or was never asked.
   */
  hireBlocker: (HireBlocker & { observedAt: string | null }) | null;
  /** The most recent price check, beside the last signed price (`latestPriceCheck`). */
  priceCheck: { at: string; outcome: string; source: PriceCheckSource } | null;
  /** Each observation on its own, with its scope and age (see `readinessRows`). */
  readiness: ReadinessRow[];
  hireable: boolean;
  /** Why testnet is not offered through Pokter's relay, when it is not: not confirmed yet, or refused. Null when it is offered or does not apply. */
  testnetRelay: { status: 'unknown' | 'refused'; note: string } | null;
  /** What its own wallet was seen doing on chain, the same reading as the catalogue's tag. Null when nothing has been read. */
  onChain: { kind: OnChainKind; text: string } | null;
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
  const offered: number[] = escrowOptionsForHire(d.quote?.currency);
  /*
   * Testnet for an agent registered elsewhere is a relayed hire. The relay
   * is offered only once Pokter has seen the agent answer a carried brief
   * (relay-refusal.ts): an agent known to refuse one, or never asked, is
   * not offered, because a buyer funded it and waited for a job that could
   * not be delivered. The
   * agent's own testnet registration, if it has one, is hired instead
   * (HireContents redirects there), so testnet stays on offer for it.
   */
  const relay: RelayStatus | null = offered.includes(97) ? await relayStatus(agent.chain_id, agent.token_id).catch(() => ({ status: 'unknown' as const, note: null })) : null;
  /* Nothing known yet: test it now, in the background, so the next visit can offer testnet. A buyer is never the test. */
  if (relay?.status === 'unknown') void probeRelay({ chainId: agent.chain_id, tokenId: agent.token_id, category }).catch(() => null);
  const relayRefused = relay && relay.status !== 'ok' ? (relay.note ?? 'Testnet is not offered for this agent.') : null;
  /* A testnet-registered agent keeps testnet: it may deliver from its own wallet, and the relay choice below is what is withheld. */
  const ownTestnet = relayRefused && agent.chain_id !== 97 ? await ownRegistration(97, agent.owner_address, agent.name ?? '', agent.chain_id, agent.token_id).catch(() => null) : null;
  const escrowOptions: number[] = relayRefused && agent.chain_id !== 97 && !ownTestnet ? offered.filter((chain) => chain !== 97) : offered;
  const escrowChain =
    requestedEscrow !== null && escrowOptions.includes(requestedEscrow)
      ? requestedEscrow
      : (escrowOptions[0] ?? ALTANA_NETWORK.chainId);
  // On testnet, an agent whose price is for mainnet is reached by Pokter's
  // delivery agent, so its price is not the one being paid.
  const testnetTrial = escrowChain === 97 && escrowOptions.includes(56);
  const addresses = correctedErc8183Addresses(escrowChain);

  const cardReadAt = new Date().toISOString();
  /* Who a hire from this page pays: the registry's agent wallet now, as the quote route reads it, so the page and the quote name one wallet. */
  const payee = await registeredAgentWallet(agent);
  const [cardRead, delivery, providers, suggestion, alternatives, imageUrl, platform] = await Promise.all([
    readCardForPage(agent.services?.a2a?.endpoint, agent.token_id).catch(() => ({ skills: [], problem: null })),
    deliveryTimes(agent.chain_id, agent.token_id).catch(() => ({ samples: 0, medianMs: null, fastestMs: null, slowestMs: null, onTime: null })),
    providerChoicesFor({ ...agent, agent_wallet: payee }, escrowChain, d.quote, relayRefused).catch(() => [] as ProviderChoice[]),
    d.quote || category === 'unclassified' ? Promise.resolve(null) : suggestedBudgetFor(category, { chainId: agent.chain_id as ChainId }).catch(() => null),
    category === 'unclassified' ? Promise.resolve([]) : recommendedAlternatives(category, agent.token_id, 3).catch(() => []),
    resolveAgentImage(agent.chain_id, agent.token_id, agent.image_url).catch(() => httpsOnly(agent.image_url)),
    currentPlatformBenchmark().catch(() => null),
  ]);

  /* The alternatives carry images too, and were reading the indexer
     alone — three more rows on a page that already reads the registry for
     the agent it is about. */
  /*
   * An MCP-only agent has no `services.a2a.endpoint`, so the card fetch
   * above returns nothing and its page claimed nothing — while the prober
   * had already listed its tools and the API was publishing them under
   * `measured.capabilities`. The reading is already loaded; it was simply
   * never asked.
   */
  const skills = cardRead.skills;
  const declared = skills.length > 0 ? skills : live.protocol === 'mcp' ? mcpCapabilities(live.tools) : [];
  const skillSource: 'card' | 'mcp' | null = declared.length === 0 ? null : skills.length > 0 ? 'card' : 'mcp';

  const alternativeImages = await resolveAgentImages(alternatives.map((alt) => alt.listing.agent));

  const answeredNow = live.ratio !== null && live.ratio > 0;
  const published = summarisePublishedEvidence(attestations);

  // The same rule the catalogue's verdict applies (`verdictFor`): answering
  // probes does not make an agent reliable while it lets paid jobs lapse.
  const { maturity, payable, history, categoryCheck } = dossierLadder(d, escrowChain, { liveAnswered: answeredNow });
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
  const quoteSettles = d.quote ? settlementChainOf(d.quote.currency) : null;
  const quoteToken = d.quote && quoteSettles !== null ? paymentTokenAt(quoteSettles, d.quote.currency) : null;
  const escrowTokens = offeredTokens(escrowChain).map((t) => ({ address: t.address, symbol: displaySymbol(t) }));
  /*
   * Only the currency actually signed. A sentence that said "prices in $U"
   * because $U is the default would be the assumption this whole change is
   * removing; the quote names its token, so that is what is said.
   */
  const pricesIn = d.quote
    ? (() => {
        const currencies = [{ address: d.quote.currency, symbol: tokenLabel(d.quote.currency) }];
        const names = currencies.map((c) => c.symbol).join(' and ');
        return {
          currencies,
          /* One observed quote shows what it signed, not everything it accepts. */
          sentence: `Its last signed price was in ${names}. When you hire, you can ask for another currency; the agent either signs a new price in it or keeps its own, and the hire is funded in whatever it signs.`,
        };
      })()
    : null;
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
    agentWallet: payee,
    createdAt: agent.created_at ?? null,
    category: meta
      ? {
          id: meta.id,
          label: meta.label,
          question: meta.question,
          blurb: meta.blurb,
          source: category === 'unclassified' ? null : categorySignalSource(agent, category),
        }
      : null,
    verdict: { id: verdict, label: AVAILABILITY_LABEL[verdict], meaning: VERDICT_MEANING[verdict], rationale: verdictRationale, recommended: proof.recommendedForHire },
    maturity,
    live: { answered: answeredNow, ratio: live.ratio, medianMs: live.medianMs, protocol: live.protocol, endpoint: live.endpoint, capabilities: live.capabilities.slice(0, 20) },
    sinceAnswer: daysSinceLastAnswer(record),
    lastCheck: d.latestCheck ? { at: d.latestCheck.probedAt, reading: endpointReading(d.latestCheck), answered: d.latestCheck.ok } : null,
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
    skillSource,
    skills: declared.slice(0, 12).map((s) => ({
      /* The skill the hire page compiles the brief against has to be the
         one the courier delivers to, and `pickWorkSkill` chooses by id. */
      id: clean(s.id, 80),
      name: clean(s.name, 80),
      kind: s.kind,
      description: s.description ? clean(s.description, 900) : null,
      /* Carried through: the hire page builds its task suggestions from
         these, so an agent that documents how to ask it gets asked that
         way. See `templatesFromSkills`. */
      examples: s.examples.map((example) => clean(example, 200)).filter(Boolean),
    })),
    evidence: { ...published, measurers: proof.measurers, windowDays: proof.windowDays },
    defects: [...new Set([...(live.method.knownDefects ?? []), ...proof.disclosedDefects])],
    // Each measurer's own limits under its name; Pokter's live check joins Pokter's sweep limits.
    defectsByMeasurer: (() => {
      const groups = (proof.byMeasurer ?? []).map((m) => ({ measurer: m.measurer, defects: m.defects }));
      const pokter = groups.find((g) => g.measurer === 'Pokter');
      const liveLimits = live.method.knownDefects ?? [];
      if (pokter) pokter.defects = [...new Set([...liveLimits, ...pokter.defects])];
      else if (liveLimits.length) groups.unshift({ measurer: 'Pokter', defects: liveLimits });
      return groups.filter((g) => g.defects.length > 0);
    })(),
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
          priceRaw: d.quote.priceRaw,
          /* Exact, in its own token, and the same label the card shows. */
          label: quotePriceLabel(d.quote),
          currency: d.quote.currency,
          symbol: quoteToken ? displaySymbol(quoteToken) : null,
          settlementChainId: quoteSettles,
          signer: d.quote.signer,
          quotedAt: d.quote.quotedAt,
          expiresAt: d.quote.expiresAt ?? null,
          current: d.quoteCurrent,
          payable,
        }
      : null,
    pricesIn,
    escrowTokens,
    corrections: getProbeStore().correctionsFor(agent.chain_id, agent.token_id),
    hireBlocker: currentHireBlocker(agent, d.quote, payable, { problem: cardRead.problem, readAt: cardReadAt }),
    priceCheck: currentPriceCheck(agent, d.quote),
    readiness: readinessRows({
      now: Date.now(),
      live: { answered: answeredNow, medianMs: live.medianMs },
      record: { totalProbes: record.totalProbes, totalAnswered: record.totalAnswered, observedDays: record.observedDays, lastSeen: record.lastSeen },
      lastCheck: d.latestCheck ? { at: d.latestCheck.probedAt, reading: endpointReading(d.latestCheck) } : null,
      quote: d.quote ? { quotedAt: d.quote.quotedAt, expiresAt: d.quote.expiresAt ?? null, current: d.quoteCurrent, payable } : null,
      escrowLabel: chainLabel(escrowChain),
      history,
      categoryCheck: categoryCheck ? { name: categoryCheck.definition.label, run: categoryCheck.run } : null,
    }),
    suggestion: suggested,
    providers,
    deliveredByPokter: agent.chain_id !== escrowChain,
    escrow: { chainId: escrowChain, paymentToken: addresses.paymentToken, commerce: addresses.commerce },
    escrowOptions,
    history,
    /* Same source as the counts beside them: the store, read once. */
    jobHistory: (() => {
      const team = teamAddressSet();
      return getJobStore()
        .byAgent(agent.chain_id, agent.token_id)
        .filter((job) => job.status !== 'OPEN')
        .slice()
        .sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt))
        .slice(0, 12)
        .map((job) => ({
          chainId: job.chainId,
          jobId: job.jobId,
          status: job.status,
          /* In the job's own token, from its own decimals: not budgetRaw / 1e18 in $U. */
          amountLabel: jobAmountLabel({ chainId: job.chainId, paymentToken: job.paymentToken ?? null, budgetRaw: job.budgetRaw }),
          paymentToken: job.paymentToken ?? null,
          hiredAt: job.hiredAt,
          delivered: job.status === 'SUBMITTED' || job.status === 'COMPLETED',
          byOperator: Boolean(job.provider) && team.has(String(job.provider).toLowerCase()),
          receipt: jobReceipt(job, escrowCommerceAddress),
        }));
    })(),
    delivery,
    sample: await sampleDelivery(agent.chain_id, agent.token_id),
    benchmark: platform ? { platform, own: agentReadings({ record, history }) } : null,
    reviews: getReviewStore().byAgent(agent.chain_id, agent.token_id).filter((r) => r.visibility !== 'hidden'),
    categoryCheck,
    services,
    repositoryUrl: httpsOnly(services.find((s) => s.name.toLowerCase() === 'repository')?.endpoint),
    warnings,
    /* Nothing left to hire on when testnet was the only network and the relay cannot reach the agent. */
    hireable: providers.length > 0 && !(relayRefused && escrowOptions.length === 0),
    testnetRelay: relay && relay.status !== 'ok' && !escrowOptions.includes(97) ? { status: relay.status, note: relayRefused ?? '' } : null,
    onChain: onChainSummary({
      category,
      description: agent.description,
      wallet: agent.agent_wallet,
      reads: agent.agent_wallet ? getCapabilityStore().reads(agent.agent_wallet) : [],
      chainLabel: (chainId) => (chainId === 56 ? 'BNB Chain' : 'BNB Testnet'),
    }),
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
