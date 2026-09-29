import 'server-only';

import { getEcosystemStats, listSearchable } from '@/lib/marketplace';
import { verdictFor } from '@/lib/search/match';
import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/agents/categories';
import type { Verdict } from '@/lib/proof/engine';
import type { Provenance } from '@/lib/api/v1';

/**
 * How far the registry gets from a claim to a hireable agent.
 *
 * Supply, not demand, and deliberately. Demand metrics on a marketplace this
 * young would be a handful of jobs presented as a trend — and a denominator
 * that small says more about our traffic than about the ecosystem. What Pokter
 * uniquely holds is the other side: it has called the registry and knows what
 * answers, which nobody can report without having done the calling.
 *
 * Each step narrows the one above it, so the numbers only fall. That shape is
 * the finding: an ERC-8004 entry is a claim that something exists, and most of
 * those claims do not survive being checked.
 */
export interface CensusStep {
  label: string;
  /** Null where the source could not be read, never zero as a stand-in. */
  value: number | null;
  provenance: Provenance;
  note: string;
  /**
   * Whether the share of the step above is a survival rate.
   *
   * Not every narrowing here is attrition. Going from the registry to the
   * classified set is a change of scope — Pokter judges four categories and
   * ignores the rest — so printing "0.02% survived" would describe our
   * coverage as though it were the ecosystem failing. Going from called to
   * answered is attrition, and saying so is the entire point of the page.
   */
  comparable: boolean;
}

export interface SupplyCensus {
  steps: CensusStep[];
  byCategory: { id: string; label: string; count: number }[];
  byVerdict: { verdict: Verdict; count: number }[];
  prices: number[];
  probes: { total: number; sweeps: number };
  observedAt: string;
}

export async function supplyCensus(): Promise<SupplyCensus> {
  const [stats, all] = await Promise.all([
    getEcosystemStats(),
    listSearchable({ limit: 30 }),
  ]);

  const quoted = all.filter((e) => e.listing.quote).length;
  const verdicts = all.map((e) => verdictFor(e));

  const steps: CensusStep[] = [
    {
      label: 'Registered on BNB Chain',
      value: stats.registered,
      provenance: 'onchain',
      note: 'ERC-8004 identities, via 8004scan. A registration is a claim that an agent exists; it is not evidence that anything answers.',
      comparable: false,
    },
    {
      label: 'Classified into a financial category',
      value: all.length,
      provenance: 'calculated',
      note: 'Pokter indexes the four categories it can judge. An agent outside them is not worse, only outside what this marketplace measures.',
      comparable: false,
    },
    {
      label: 'Called by Pokter',
      value: stats.agentsMonitored,
      provenance: 'pokter-measured',
      note: 'Agents with at least one probe on record. Anything never called is reported as unmeasured rather than assumed dead.',
      comparable: false,
    },
    {
      label: 'Answered when called',
      value: stats.agentsAnswering,
      provenance: 'pokter-measured',
      note: 'A probe counts only when the endpoint returns well-formed JSON. An HTTP 200 alone is not counted.',
      comparable: true,
    },
    {
      label: 'Quoted a signed price',
      value: quoted,
      provenance: 'attested',
      note: 'Returned a price signed by the wallet in their registry record. This is the point an agent becomes commercially reachable rather than merely alive.',
      comparable: true,
    },
    {
      label: 'Independently proven',
      value: verdicts.filter((v) => v === 'proven').length,
      provenance: 'attested',
      note: 'Two independent measurers agreeing. Pokter never counts itself, so an agent measured only by us cannot reach this however well it performs.',
      comparable: true,
    },
  ];

  return {
    steps,
    byCategory: CATEGORIES.map((c) => ({
      id: c.id,
      label: CATEGORY_BY_ID.get(c.id)?.label ?? c.id,
      count: all.filter((e) => e.listing.category === c.id).length,
    })),
    byVerdict: (['proven', 'emerging', 'unproven', 'failing'] as Verdict[]).map(
      (verdict) => ({
        verdict,
        count: verdicts.filter((v) => v === verdict).length,
      }),
    ),
    prices: all
      .map((e) => e.listing.quote?.priceU)
      .filter((p): p is number => typeof p === 'number')
      .sort((a, b) => a - b),
    probes: { total: stats.probesTaken, sweeps: stats.sweeps },
    observedAt: new Date().toISOString(),
  };
}
