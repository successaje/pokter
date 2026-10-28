import 'server-only';

import { CATEGORIES, CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { catalogueCounts } from '@/lib/agents/catalogue-counts';
import { distinctAgentCount, mainnetFirstPerAgent } from '@/lib/agents/distinct';
import { interpretBrief, type BriefReading } from '@/lib/brief/interpret';
import { findRows, type FindRow } from '@/lib/find/rows';
import { listSearchableWithStatus, searchById, searchByName } from '@/lib/marketplace';
import { offersDirectHire, matchesQuery, type SearchableAgent } from '@/lib/search/match';
import { orderMarketplace } from '@/lib/search/order';
import type { DiscoverParams } from './params';
import { parseQuery } from '@/lib/search/query';
import { closestNames, describeNameMatch, nameMatch, NAME_MATCH, parseAgentId, placeNameMatches } from '@/lib/search/names';
import { chainLabel } from '@/lib/network/presentation';

const STOP = new Set([
  'i', 'me', 'my', 'need', 'want', 'someone', 'something', 'an', 'a', 'the', 'to', 'of', 'for', 'and', 'or', 'agent',
  'agents', 'that', 'can', 'will', 'please', 'help', 'with', 'on', 'in', 'is', 'it', 'do', 'be', 'find', 'me', 'should',
  'could', 'would', 'what', 'which', 'who', 'how', 'this', 'these', 'those', 'our', 'your', 'from', 'about', 'are',
]);

export interface DiscoverResult {
  /** `nameOnly`: found by name in the registry, not as a match for the task described. Shown after the matches, under its own heading. */
  rows: Array<FindRow & { reason: string | null; alsoOn: number[]; nameOnly: boolean }>;
  total: number;
  /** Agents under every filter but the task: the "All tasks" count. */
  allTasksCount: number;
  /** When a search finds nothing: names close to it, else agents hireable now. */
  /** Agents whose names are close to a query that matched nothing; never unrelated ones. */
  suggestions: { close: FindRow[] } | null;
  /** How a natural-language query was read; null for no query or advanced syntax. */
  reading: (BriefReading & { categoryLabel: string | null; terms: string[]; byName: boolean; byId: boolean }) | null;
  advanced: { unknown: string[] } | null;
  categoryCounts: Array<{ id: Category | 'unclassified'; label: string; count: number }>;
  /** The newest listings in the catalogue, whatever the current filters are. */
  recent: FindRow[];
  /** Sizes of the curated shortcuts, over everything listed. */
  collections: { hireable: number; priced: number; answering: number; checked: number; outsideDelivery: number; corroborated: number };
  /**
   * What turning each filter on would show, under everything else that is
   * on now (the task, the words, the network, the other filters): the
   * number beside a filter, the same rule as the task counts.
   */
  filterCounts: FilterCounts;
  unreachable: boolean;
  /** Category labels on a chain where a registry read failed, so results there may be missing. */
  incomplete: string[];
}

export type Signal = 'hireable' | 'priced' | 'outsideDelivery' | 'checked' | 'answering';
export type FilterCounts = Record<Signal | 'measured' | 'corroborated' | 'anyEvidence', number>;

/** What each buyer signal requires of an agent, used for the results and for the counts beside each signal. */
const SIGNAL_TESTS: Record<Signal, (e: SearchableAgent) => boolean> = {
  hireable: (e) => offersDirectHire(e),
  priced: (e) => e.listing.quote != null,
  outsideDelivery: (e) => (e.history?.outsideTeam.completed ?? 0) > 0,
  checked: (e) => e.tested === true,
  answering: (e) => answeredThisWeek(e),
};

/** The evidence choices other than "any". */
const EVIDENCE_TESTS: Record<'measured' | 'corroborated', (e: SearchableAgent) => boolean> = {
  measured: (e) => e.record.totalProbes > 0,
  corroborated: (e) => e.listing.attestationCount > 0,
};

function textTerms(q: string) {
  return Array.from(new Set(q.toLowerCase().split(/[^a-z0-9$%.-]+/).filter((t) => t.length > 2 && !STOP.has(t))));
}

function haystack(entry: SearchableAgent) {
  const a = entry.listing.agent;
  return `${a.name} ${a.description ?? ''}`.toLowerCase();
}

/**
 * Discover's search. Two readings of the same box:
 *
 *  - Plain language ("watch my Venus loan") is read for intent with the
 *    keyword interpreter, which picks a category and says why, then ranked
 *    by how many of the person's own words the agent's description uses.
 *  - Qualifier syntax (`is:proven has:probes>10`) is the advanced grammar
 *    from the public API, for people who want exact filters.
 *
 * Every result carries the reason it matched, in words.
 */
export async function discover(params: DiscoverParams): Promise<DiscoverResult> {
  const { entries, unreachable, incomplete } = await listSearchableWithStatus({ limit: 400 });
  const promotable = entries.filter((entry) => isPromotableAgent(entry.listing.agent));

  const q = params.q.trim();
  const usesGrammar = /(^|\s)(is|tag|has):\S/.test(q);
  let reading: DiscoverResult['reading'] = null;
  let advanced: DiscoverResult['advanced'] = null;
  let pool: SearchableAgent[] = promotable;
  const reasons = new Map<SearchableAgent, string>();
  const nameOnly = new Set<SearchableAgent>();

  if (q && usesGrammar) {
    const parsed = parseQuery(q);
    advanced = { unknown: parsed.unknown };
    pool = pool.filter((entry) => matchesQuery(entry, parsed));
  } else if (q) {
    const brief = interpretBrief(q);
    const terms = textTerms(q);
    const categoryLabel = brief.category ? (CATEGORY_BY_ID.get(brief.category)?.label ?? null) : null;
    reading = { ...brief, categoryLabel, terms, byName: false, byId: false };
    // One or two letters are a name being typed, not a task being described.
    const describesTask = q.length >= 3;
    const agentId = parseAgentId(q);
    /* The whole listing, before the query narrows it: an ID is looked up in all of it. */
    const everyone = pool;

    const scored = pool
      .map((entry) => {
        const text = haystack(entry);
        const hits = describesTask ? terms.filter((term) => text.includes(term)) : [];
        const inCategory = describesTask && brief.category !== null && entry.listing.category === brief.category;
        const named = nameMatch(entry.listing.agent.name, q);
        // A name match outranks any description match; within each, the
        // chosen order (by default hireable and answering first) decides.
        return { entry, hits, inCategory, named, score: named * 10 + (inCategory ? 2 : 0) + (hits.length > 0 ? 1 : 0) };
      })
      .filter((s) => s.named > 0 || (brief.category ? s.inCategory || s.hits.length >= 2 : s.hits.length > 0));

    reading.byName = scored.some((s) => s.named > 0);
    for (const s of scored) {
      const parts: string[] = [];
      if (s.named > 0) parts.push(describeNameMatch(s.named, q));
      if (s.inCategory && categoryLabel) parts.push(`${categoryLabel} agent`);
      if (s.hits.length) parts.push(`describes ${s.hits.slice(0, 3).map((h) => `“${h}”`).join(', ')}`);
      reasons.set(s.entry, parts.join(' · '));
    }
    const rank = new Map(scored.map((s) => [s.entry, s.score]));
    pool = orderMarketplace(scored.map((s) => s.entry), params.sort).sort((a, b) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0));

    /*
     * No agent in the pool has exactly this name: ask the registry by name.
     *
     * The pool is built from the category listings, so an agent in no
     * category is not in it, and typing its exact name found nothing:
     * "no such agent" rather than "not in a category". Asked whenever no
     * name in the pool matches exactly, because the pool is rarely empty
     * and a page of description or partial-name matches can hide that the
     * named agent is absent.
     */
    const poolNamed = scored.some((s) => s.named > 0);
    if (describesTask && !agentId && !scored.some((s) => s.named === NAME_MATCH.exact)) {
      const have = new Set(pool.map((entry) => `${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`));
      const found = (await searchByName(q)).filter(
        (entry) => isPromotableAgent(entry.listing.agent) && !have.has(`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`),
      );
      const exactly = (entry: SearchableAgent) => nameMatch(entry.listing.agent.name, q) === NAME_MATCH.exact;
      /* Where the pool already has name matches, only an exact name is worth adding to them. */
      const byName = poolNamed ? found.filter(exactly) : found;
      /*
       * A task Pokter recognises ("Monitor my lending risk") is answered by
       * agents in that category first. The registry's name search returned
       * loose matches for those words, a never-answering health guard and
       * unrelated yield agents, and they were put above every real
       * health-factor agent. Now they follow the matches, labelled. A query
       * that is not a recognised task is still most likely a name, so there
       * the name results lead. An exact name leads either way.
       */
      for (const entry of byName) {
        if (exactly(entry)) {
          reasons.set(entry, 'Exact name');
          continue;
        }
        reasons.set(entry, brief.category ? 'Matched by name only · not shown doing this task' : 'Found by name · not in a category listing');
        if (brief.category) nameOnly.add(entry);
      }
      if (byName.some(exactly)) reading.byName = true;
      pool = placeNameMatches(pool, orderMarketplace(byName, params.sort), {
        nameOf: (entry) => entry.listing.agent.name,
        query: q,
        taskRecognised: brief.category !== null,
      });
    }

    /*
     * An agent's ID ("342378", "56/342378") is the most exact thing a person
     * can type. Its agent leads, from the listings or read from the registry
     * when it is in none.
     */
    if (agentId) {
      const sameId = (entry: SearchableAgent) =>
        entry.listing.agent.token_id === agentId.tokenId && (agentId.chainId === null || entry.listing.agent.chain_id === agentId.chainId);
      const listed = everyone.filter(sameId);
      const byId = listed.length > 0 ? listed : (await searchById(agentId.chainId, agentId.tokenId)).filter((entry) => isPromotableAgent(entry.listing.agent));
      for (const entry of byId) reasons.set(entry, `Agent ID ${entry.listing.agent.chain_id}/${entry.listing.agent.token_id}`);
      if (byId.length > 0) reading.byId = true;
      pool = [...byId, ...pool.filter((entry) => !byId.includes(entry))];
    }
  }

  /*
   * Every filter is one rule, used for the results and for every count
   * beside them. The task counts used to be taken before the availability,
   * evidence and network filters, so "All tasks 165" sat over 61 results,
   * and the collection cards counted registrations where the list showed
   * agents. A count now says what picking it would show.
   */
  const rules: Record<'category' | 'chain' | 'hireable' | 'answering' | 'priced' | 'checked' | 'outsideDelivery' | 'evidence', (e: SearchableAgent) => boolean> = {
    category: (e) => !params.category || e.listing.category === params.category,
    chain: (e) => params.chain === 'any' || String(e.listing.agent.chain_id) === params.chain,
    hireable: (e) => !params.hireable || SIGNAL_TESTS.hireable(e),
    answering: (e) => !params.answering || SIGNAL_TESTS.answering(e),
    priced: (e) => !params.priced || SIGNAL_TESTS.priced(e),
    checked: (e) => !params.checked || SIGNAL_TESTS.checked(e),
    outsideDelivery: (e) => !params.outsideDelivery || SIGNAL_TESTS.outsideDelivery(e),
    evidence: (e) => params.evidence === 'any' || EVIDENCE_TESTS[params.evidence](e),
  };
  const applying = (items: SearchableAgent[], skip?: keyof typeof rules) =>
    items.filter((e) => (Object.keys(rules) as Array<keyof typeof rules>).every((key) => key === skip || rules[key](e)));
  // One row per agent across networks, shown in its mainnet registration;
  // a single network shows that network's.
  const perAgent = (items: SearchableAgent[]) =>
    params.chain === 'any' ? mainnetFirstPerAgent(items, (e) => e.listing.agent) : { items, alsoOn: new Map<SearchableAgent, number[]>() };

  let filtered = applying(pool);
  if (!q || usesGrammar) filtered = orderMarketplace(filtered, params.sort);
  const { items: shown, alsoOn } = perAgent(filtered);

  const forTasks = perAgent(applying(pool, 'category')).items;
  /*
   * The five, and then the rest when there is any: signed agents in work
   * Pokter does not evaluate are listed, so the tasks add up to "All tasks"
   * and a buyer can find them, under a name that claims no evaluation.
   */
  const unclassified = forTasks.filter((e) => e.listing.category === 'unclassified').length;
  const categoryCounts: DiscoverResult['categoryCounts'] = [
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: forTasks.filter((e) => e.listing.category === c.id).length })),
    ...(unclassified > 0 ? [{ id: 'unclassified' as const, label: 'Unclassified', count: unclassified }] : []),
  ];

  /*
   * Each filter's count is what clicking it would show: every other rule as
   * it is, this one turned on. Counted over the whole catalogue instead, a
   * pill under a chosen task said 93 where clicking showed 21.
   */
  const ifOn = (skip: keyof typeof rules, test: (e: SearchableAgent) => boolean) => perAgent(applying(pool, skip).filter(test)).items.length;
  const filterCounts: FilterCounts = {
    hireable: ifOn('hireable', SIGNAL_TESTS.hireable),
    priced: ifOn('priced', SIGNAL_TESTS.priced),
    outsideDelivery: ifOn('outsideDelivery', SIGNAL_TESTS.outsideDelivery),
    checked: ifOn('checked', SIGNAL_TESTS.checked),
    answering: ifOn('answering', SIGNAL_TESTS.answering),
    anyEvidence: ifOn('evidence', () => true),
    measured: ifOn('evidence', EVIDENCE_TESTS.measured),
    corroborated: ifOn('evidence', EVIDENCE_TESTS.corroborated),
  };

  const rows = findRows(shown);
  const distinct = (items: SearchableAgent[]) => distinctAgentCount(items.map((e) => e.listing.agent));

  let suggestions: DiscoverResult['suggestions'] = null;
  if (q && !usesGrammar && rows.length === 0) {
    const everyone = mainnetFirstPerAgent(promotable, (e) => e.listing.agent).items;
    const close = closestNames(everyone, (e) => e.listing.agent.name, q);
    /*
     * Names close to what was typed, and nothing else. This used to fall
     * back to three agents that "answered this week and can be hired now",
     * whatever was asked: "Translate Korean subtitles" got DeFi agents,
     * which reads as a recommendation for a job none of them does. The page
     * now says why nothing matched and offers the request board instead.
     */
    suggestions = { close: findRows(close) };
  }

  /*
   * Newest first by registration date, over everything listed rather than
   * over the filtered page. A "recently listed" strip that narrows with the
   * filters would repeat the results above it, which is the one thing it
   * cannot be useful for.
   */
  const recent = findRows(
    mainnetFirstPerAgent(promotable, (e) => e.listing.agent)
      .items.slice()
      .sort((a, b) => String(b.listing.agent.created_at ?? '').localeCompare(String(a.listing.agent.created_at ?? '')))
      .slice(0, 8),
  );

  return {
    rows: rows.map((row, i) => ({ ...row, reason: reasons.get(shown[i]) ?? null, alsoOn: alsoOn.get(shown[i]) ?? [], nameOnly: nameOnly.has(shown[i]) })),
    recent,
    total: rows.length,
    allTasksCount: forTasks.length,
    reading,
    advanced,
    categoryCounts,
    filterCounts,
    collections: {
      // Each card's count is what clicking it shows: one rule, one agent each.
      ...catalogueCounts(entries),
      answering: distinct(promotable.filter(answeredThisWeek)),
      checked: distinct(promotable.filter((e) => e.tested === true)),
      outsideDelivery: distinct(promotable.filter((e) => (e.history?.outsideTeam.completed ?? 0) > 0)),
      corroborated: distinct(promotable.filter((e) => e.listing.attestationCount > 0)),
    },
    suggestions,
    unreachable,
    incomplete: [...new Set(incomplete.map(({ category, chainId }) => `${CATEGORY_BY_ID.get(category)?.label ?? category} on ${chainLabel(chainId)}`))],
  };
}

function answeredThisWeek(entry: SearchableAgent): boolean {
  const week = entry.record.windows.find((w) => w.label === '7d');
  return Boolean(week && week.probes > 0 && (week.ratio ?? 0) > 0);
}
