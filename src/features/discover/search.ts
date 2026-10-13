import 'server-only';

import { CATEGORIES, CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { catalogueCounts } from '@/lib/agents/catalogue-counts';
import { firstPerAgent } from '@/lib/agents/distinct';
import { interpretBrief, type BriefReading } from '@/lib/brief/interpret';
import { findRows, type FindRow } from '@/lib/find/rows';
import { listSearchableWithStatus, searchByName } from '@/lib/marketplace';
import { offersDirectHire, matchesQuery, type SearchableAgent } from '@/lib/search/match';
import { orderMarketplace } from '@/lib/search/order';
import type { DiscoverParams } from './params';
import { parseQuery } from '@/lib/search/query';

const STOP = new Set([
  'i', 'me', 'my', 'need', 'want', 'someone', 'something', 'an', 'a', 'the', 'to', 'of', 'for', 'and', 'or', 'agent',
  'agents', 'that', 'can', 'will', 'please', 'help', 'with', 'on', 'in', 'is', 'it', 'do', 'be', 'find', 'me', 'should',
  'could', 'would', 'what', 'which', 'who', 'how', 'this', 'these', 'those', 'our', 'your', 'from', 'about', 'are',
]);

export interface DiscoverResult {
  rows: Array<FindRow & { reason: string | null }>;
  total: number;
  /** How a natural-language query was read; null for no query or advanced syntax. */
  reading: (BriefReading & { categoryLabel: string | null; terms: string[] }) | null;
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
    reading = { ...brief, categoryLabel, terms };

    const scored = pool
      .map((entry) => {
        const text = haystack(entry);
        const hits = terms.filter((term) => text.includes(term));
        const inCategory = brief.category !== null && entry.listing.category === brief.category;
        // Coarse bands, so relevance groups results and the chosen order (by
        // default: hireable and answering first) decides within each group.
        return { entry, hits, inCategory, score: (inCategory ? 2 : 0) + (hits.length > 0 ? 1 : 0) };
      })
      .filter((s) => (brief.category ? s.inCategory || s.hits.length >= 2 : s.hits.length > 0));

    for (const s of scored) {
      const parts: string[] = [];
      if (s.inCategory && categoryLabel) parts.push(`${categoryLabel} agent`);
      if (s.hits.length) parts.push(`describes ${s.hits.slice(0, 3).map((h) => `“${h}”`).join(', ')}`);
      reasons.set(s.entry, parts.join(' · '));
    }
    const rank = new Map(scored.map((s) => [s.entry, s.score]));
    pool = scored.map((s) => s.entry);
    // Relevance first; the chosen order breaks ties within a relevance band.
    pool = orderMarketplace(pool, params.sort).sort((a, b) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0));

    /*
     * No agent whose name matches: ask the registry by name.
     *
     * The pool is built from the five category listings, so an agent in
     * no category is not in it — and typing that agent's exact name
     * found nothing, which reads as "no such agent" rather than "not in
     * a category". Pokter's own evidence agents are the clearest case:
     * both answer, both sign a price, neither was findable.
     *
     * The trigger is a missing name match rather than an empty pool,
     * because the pool is rarely empty and that is the trap. "Pokter
     * Evidence" already returned nine agents whose descriptions happen
     * to contain "evidence", so a search for an exact name looked
     * answered while the agent itself stayed invisible. Nine wrong
     * answers is worse than none, not better.
     *
     * Results are merged ahead of the weak text hits and deduped, and
     * the reason says how they were reached.
     */
    const named = (entry: SearchableAgent) => {
      const name = entry.listing.agent.name.toLowerCase();
      return terms.length > 0 && terms.every((term) => name.includes(term));
    };
    if (!pool.some(named)) {
      const have = new Set(pool.map((entry) => `${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`));
      const byName = (await searchByName(q)).filter(
        (entry) =>
          isPromotableAgent(entry.listing.agent) &&
          !have.has(`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`),
      );
      for (const entry of byName) reasons.set(entry, 'Found by name · not in a category listing');
      pool = [...orderMarketplace(byName, params.sort), ...pool];
    }
  }

  const categoryCounts = CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: pool.filter((e) => e.listing.category === c.id).length }));

  let filtered = pool;
  if (params.category) filtered = filtered.filter((e) => e.listing.category === params.category);
  if (params.chain !== 'any') filtered = filtered.filter((e) => String(e.listing.agent.chain_id) === params.chain);
  if (params.hireable) filtered = filtered.filter((e) => offersDirectHire(e));
  if (params.answering) {
    filtered = filtered.filter((e) => {
      const day = e.record.windows.find((w) => w.label === '7d');
      return Boolean(day && day.probes > 0 && (day.ratio ?? 0) > 0);
    });
  }
  if (params.priced) filtered = filtered.filter((e) => e.listing.quote != null);
  if (params.evidence === 'measured') filtered = filtered.filter((e) => e.record.totalProbes > 0);
  if (params.evidence === 'corroborated') filtered = filtered.filter((e) => e.listing.attestationCount > 0);

  if (!q || usesGrammar) filtered = orderMarketplace(filtered, params.sort);

  // One row per agent: an agent registered on both chains by the same owner
  // is shown once, in its best-ranked registration, so the list and the
  // counts above it agree. Filtering to one chain shows that chain's.
  if (params.chain === 'any') filtered = firstPerAgent(filtered, (e) => e.listing.agent);
  const rows = findRows(filtered);
  return {
    rows: rows.map((row, i) => ({ ...row, reason: reasons.get(filtered[i]) ?? null })),
    total: rows.length,
    reading,
    advanced,
    categoryCounts,
    collections: {
      // The same figures as the home page and the methodology census.
      ...catalogueCounts(entries),
      answering: promotable.filter((e) => {
        const w = e.record.windows.find((x) => x.label === '7d');
        return Boolean(w && w.probes > 0 && (w.ratio ?? 0) > 0);
      }).length,
      corroborated: promotable.filter((e) => e.listing.attestationCount > 0).length,
    },
    unreachable,
  };
}
