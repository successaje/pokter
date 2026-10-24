import type { BuilderDiagnostics, HeadlineId } from './report';

/**
 * Every agent a builder owns, on one screen: what buyers did with each in
 * the window and the one thing to fix first.
 *
 * Built from each agent's own diagnostics, never recounted: the headline
 * is the one the agent's "Why hires fail" tab leads with, and the counts
 * are its counts, so the overview and the agent page cannot disagree. An
 * agent whose report could not be read is listed as not counted, and is
 * left out of the totals rather than added to them as zeroes.
 */

export type DeskTone = 'bad' | 'watch' | 'neutral' | 'ok' | 'info';

export const HEADLINE_TONE: Record<HeadlineId, DeskTone> = {
  'blocked-before-any-buyer': 'bad',
  'buyers-stopped': 'watch',
  'deliveries-lapsed': 'watch',
  'no-buyer-yet': 'neutral',
  'nothing-failing': 'ok',
  'not-measurable': 'info',
};

/* What needs the builder soonest comes first. */
const TONE_ORDER: Record<DeskTone, number> = { bad: 0, watch: 1, info: 2, neutral: 3, ok: 4 };

export type DeskInput = {
  chainId: number;
  tokenId: string;
  name: string;
  result:
    | { ok: true; diagnostics: Pick<BuilderDiagnostics, 'headline' | 'demand' | 'funding'> }
    | { ok: false; message: string };
};

export interface DeskRow {
  key: string;
  chainId: number;
  tokenId: string;
  name: string;
  /** The agent's own diagnostics tab. */
  href: string;
  counted: boolean;
  tone: DeskTone;
  title: string;
  fix: { label: string; href: string } | null;
  /** Hire flows opened; null when that count could not be read. */
  opens: number | null;
  asks: number;
  quoted: number;
  stopped: number;
  funded: number;
}

export interface FleetDesk {
  windowDays: number;
  rows: DeskRow[];
  totals: { opens: number | null; asks: number; quoted: number; stopped: number; funded: number; counted: number; notCounted: number };
  /** Owned agents left off because the desk reads a bounded number. */
  omitted: number;
}

export function buildFleetDesk(inputs: readonly DeskInput[], windowDays: number, omitted = 0): FleetDesk {
  const built = inputs.map((input): DeskRow => {
    const base = {
      key: `${input.chainId}:${input.tokenId}`,
      chainId: input.chainId,
      tokenId: input.tokenId,
      name: input.name,
      href: `/build/agents/${input.chainId}/${input.tokenId}#diagnostics`,
    };
    if (!input.result.ok) {
      return { ...base, counted: false, tone: 'info', title: input.result.message, fix: null, opens: null, asks: 0, quoted: 0, stopped: 0, funded: 0 };
    }
    const { headline, demand, funding } = input.result.diagnostics;
    return {
      ...base,
      counted: true,
      tone: HEADLINE_TONE[headline.id],
      title: headline.title,
      fix: headline.remediation ? { label: headline.remediation.fix.label, href: headline.remediation.fix.href } : null,
      opens: demand.hireFlowOpens,
      asks: demand.attempts,
      quoted: demand.quoted,
      stopped: demand.stopped,
      funded: funding.fundedInWindow,
    };
  });
  const rows = built
    .map((row, index) => ({ row, index }))
    .sort((a, b) => TONE_ORDER[a.row.tone] - TONE_ORDER[b.row.tone] || b.row.stopped - a.row.stopped || b.row.asks - a.row.asks || a.index - b.index)
    .map(({ row }) => row);

  const counted = rows.filter((row) => row.counted);
  const sum = (pick: (row: DeskRow) => number) => counted.reduce((total, row) => total + pick(row), 0);
  const opens = counted.some((row) => row.opens !== null) ? sum((row) => row.opens ?? 0) : null;
  return {
    windowDays,
    rows,
    totals: {
      opens,
      asks: sum((row) => row.asks),
      quoted: sum((row) => row.quoted),
      stopped: sum((row) => row.stopped),
      funded: sum((row) => row.funded),
      counted: counted.length,
      notCounted: rows.length - counted.length,
    },
    omitted,
  };
}
