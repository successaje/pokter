import 'server-only';

import { CATEGORIES, CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { catalogueCounts } from '@/lib/agents/catalogue-counts';
import { distinctAgentCount, mainnetFirstPerAgent } from '@/lib/agents/distinct';
import { interpretBrief, type BriefReading } from '@/lib/brief/interpret';
import { findRows, type FindRow } from '@/lib/find/rows';
import { listSearchableWithStatus, searchByName } from '@/lib/marketplace';
import { offersDirectHire, matchesQuery, type SearchableAgent } from '@/lib/search/match';
import { orderMarketplace } from '@/lib/search/order';
import type { DiscoverParams } from './params';
import { parseQuery } from '@/lib/search/query';
import { closestNames, describeNameMatch, nameMatch } from '@/lib/search/names';

const STOP = new Set([
  'i', 'me', 'my', 'need', 'want', 'someone', 'something', 'an', 'a', 'the', 'to', 'of', 'for', 'and', 'or', 'agent',
  'agents', 'that', 'can', 'will', 'please', 'help', 'with', 'on', 'in', 'is', 'it', 'do', 'be', 'find', 'me', 'should',
  'could', 'would', 'what', 'which', 'who', 'how', 'this', 'these', 'those', 'our', 'your', 'from', 'about', 'are',
]);

export interface DiscoverResult {
  rows: Array<FindRow & { reason: string | null; alsoOn: number[] }>;
  total: number;
  /** Agents under every filter but the task: the "All tasks" count. */
  allTasksCount: number;
  /** When a search finds nothing: names close to it, else agents hireable now. */
  suggestions: { close: FindRow[]; active: FindRow[] } | null;
  /** How a natural-language query was read; null for no query or advanced syntax. */
  reading: (BriefReading & { categoryLabel: string | null; terms: string[]; byName: boolean }) | null;
  advanced: { unknown: string[] } | null;
  categoryCounts: Array<{ id: Category; label: string; count: number }>;
  /** Sizes of the curated shortcuts, over everything listed. */
  collections: { hireable: number; priced: number; answering: number; corroborated: number };
  unreachable: boolean;
}

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
  const { entries, unreachable } = await listSearchableWithStatus({ limit: 400 });
  const promotable = entries.filter((entry) => isPromotableAgent(entry.listing.agent));

  const q = params.q.trim();
  const usesGrammar = /(^|\s)(is|tag|has):\S/.test(q);
  let reading: DiscoverResult['reading'] = null;
  let advanced: DiscoverResult['advanced'] = null;
  let pool: SearchableAgent[] = promotable;
  const reasons = new Map<SearchableAgent, string>();

  if (q && usesGrammar) {
    const parsed = parseQuery(q);
    advanced = { unknown: parsed.unknown };
    pool = pool.filter((entry) => matchesQuery(entry, parsed));
  } else if (q) {
    const brief = interpretBrief(q);
    const terms = textTerms(q);
    const categoryLabel = brief.category ? (CATEGORY_BY_ID.get(brief.category)?.label ?? null) : null;
    reading = { ...brief, categoryLabel, terms, byName: false };
    // One or two letters are a name being typed, not a task being described.
    const describesTask = q.length >= 3;

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
     * No agent whose name matches: ask the registry by name.
     *
     * The pool is built from the category listings, so an agent in no
     * category is not in it, and typing its exact name found nothing:
     * "no such agent" rather than "not in a category". Asked whenever no
     * name in the pool matches, because the pool is rarely empty and a
     * page of description matches can hide that the named agent is absent.
     */
    if (describesTask && !scored.some((s) => s.named > 0)) {
      const have = new Set(pool.map((entry) => `${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`));
      const byName = (await searchByName(q)).filter(
        (entry) => isPromotableAgent(entry.listing.agent) && !have.has(`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`),
      );
      for (const entry of byName) reasons.set(entry, 'Found by name · not in a category listing');
      pool = [...orderMarketplace(byName, params.sort), ...pool];
    }
  }

  /*
   * Every filter is one rule, used for the results and for every count
   * beside them. The task counts used to be taken before the availability,
   * evidence and network filters, so "All tasks 165" sat over 61 results,
   * and the collection cards counted registrations where the list showed
   * agents. A count now says what picking it would show.
   */
  const rules: Record<'category' | 'chain' | 'hireable' | 'answering' | 'priced' | 'evidence', (e: SearchableAgent) => boolean> = {
    category: (e) => !params.category || e.listing.category === params.category,
    chain: (e) => params.chain === 'any' || String(e.listing.agent.chain_id) === params.chain,
    hireable: (e) => !params.hireable || offersDirectHire(e),
    answering: (e) => !params.answering || answeredThisWeek(e),
    priced: (e) => !params.priced || e.listing.quote != null,
    evidence: (e) => (params.evidence === 'measured' ? e.record.totalProbes > 0 : params.evidence === 'corroborated' ? e.listing.attestationCount > 0 : true),
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
  const categoryCounts = CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: forTasks.filter((e) => e.listing.category === c.id).length }));

  const rows = findRows(shown);
  const distinct = (items: SearchableAgent[]) => distinctAgentCount(items.map((e) => e.listing.agent));

  let suggestions: DiscoverResult['suggestions'] = null;
  if (q && !usesGrammar && rows.length === 0) {
    const everyone = mainnetFirstPerAgent(promotable, (e) => e.listing.agent).items;
    const close = closestNames(everyone, (e) => e.listing.agent.name, q);
    const active = close.length
      ? []
      : orderMarketplace(everyone.filter((e) => offersDirectHire(e) && answeredThisWeek(e)), 'recommended').slice(0, 3);
    suggestions = { close: findRows(close), active: findRows(active) };
  }

  return {
    rows: rows.map((row, i) => ({ ...row, reason: reasons.get(shown[i]) ?? null, alsoOn: alsoOn.get(shown[i]) ?? [] })),
    total: rows.length,
    allTasksCount: forTasks.length,
    reading,
    advanced,
    categoryCounts,
    collections: {
      // Each card's count is what clicking it shows: one rule, one agent each.
      ...catalogueCounts(entries),
      answering: distinct(promotable.filter(answeredThisWeek)),
      corroborated: distinct(promotable.filter((e) => e.listing.attestationCount > 0)),
    },
    suggestions,
    unreachable,
  };
}

function answeredThisWeek(entry: SearchableAgent): boolean {
  const week = entry.record.windows.find((w) => w.label === '7d');
  return Boolean(week && week.probes > 0 && (week.ratio ?? 0) > 0);
}
