import type { ProbeRecord } from './store';
import { isAwaitingAgentProbe } from '@/lib/proof/probe-target';

/** Uptime measured over one time window. */
export interface Window {
  label: string;
  days: number;
  probes: number;
  answered: number;
  /** 0..1, or null when the window holds no probes. */
  ratio: number | null;
  medianMs: number | null;
}

/** One day's worth of probes, for the timeline strip. */
export interface DayBucket {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  probes: number;
  answered: number;
  ratio: number | null;
}

/** An observed period during which the agent answered nothing. */
export interface Outage {
  from: string;
  to: string;
  probes: number;
}

export interface TrackRecord {
  windows: Window[];
  days: DayBucket[];
  firstSeen: string | null;
  lastSeen: string | null;
  totalProbes: number;
  totalAnswered: number;
  /** The longest run of consecutive failed probes we observed. */
  longestOutage: Outage | null;
  /** Days between the first and last probe — how long we have actually watched. */
  observedDays: number;
  /**
   * The address's latest reply was a listing with no agent bound to it.
   *
   * While it holds, every figure above is empty (see `buildTrackRecord`), so
   * the listing reads as not measured rather than failing, and this says
   * why. Optional so a record built by hand needs no change;
   * `buildTrackRecord` always sets it.
   */
  awaitingAgent?: boolean;
}

const WINDOWS: { label: string; days: number }[] = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function summariseWindow(
  probes: ProbeRecord[],
  { label, days }: { label: string; days: number },
  now: number,
): Window {
  const cutoff = now - days * 86_400_000;
  const inWindow = probes.filter((p) => Date.parse(p.probedAt) >= cutoff);
  const answered = inWindow.filter((p) => p.ok).length;

  return {
    label,
    days,
    probes: inWindow.length,
    answered,
    ratio: inWindow.length === 0 ? null : answered / inWindow.length,
    medianMs: median(
      inWindow
        .filter((p) => p.ok && p.latencyMs !== null)
        .map((p) => p.latencyMs as number),
    ),
  };
}

function bucketByDay(probes: ProbeRecord[]): DayBucket[] {
  const buckets = new Map<string, { probes: number; answered: number }>();

  for (const probe of probes) {
    const date = probe.probedAt.slice(0, 10);
    const bucket = buckets.get(date) ?? { probes: 0, answered: 0 };
    bucket.probes += 1;
    if (probe.ok) bucket.answered += 1;
    buckets.set(date, bucket);
  }

  return [...buckets.entries()]
    .map(([date, b]) => ({
      date,
      probes: b.probes,
      answered: b.answered,
      ratio: b.probes === 0 ? null : b.answered / b.probes,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The longest unbroken run of failures. This is the number that matters for a
 * health-factor agent: average uptime hides a four-hour blackout, and a
 * four-hour blackout is when a position gets liquidated.
 */
function findLongestOutage(ascending: ProbeRecord[]): Outage | null {
  let longest: Outage | null = null;
  let runStart: string | null = null;
  let runEnd: string | null = null;
  let runLength = 0;

  const close = () => {
    if (runStart && runEnd && (!longest || runLength > longest.probes)) {
      longest = { from: runStart, to: runEnd, probes: runLength };
    }
    runStart = null;
    runEnd = null;
    runLength = 0;
  };

  for (const probe of ascending) {
    if (probe.ok) {
      close();
      continue;
    }
    if (runStart === null) runStart = probe.probedAt;
    runEnd = probe.probedAt;
    runLength += 1;
  }
  close();

  return longest;
}

/**
 * Whether the address still answers with a listing that has no agent bound.
 *
 * Decided by the latest probe the address replied to. A probe that got no
 * reply, or a server error, says nothing about whether an agent has been
 * bound, so it is passed over: the listing's host timing out on a few probes
 * in a hundred must not flip the label to failing until the next check.
 */
function awaitsBoundAgent(ascending: ProbeRecord[]): boolean {
  for (let i = ascending.length - 1; i >= 0; i -= 1) {
    const probe = ascending[i];
    if (!probe.ok && (probe.status === null || probe.status >= 500)) continue;
    return isAwaitingAgentProbe(probe);
  }
  return false;
}

/**
 * Build the full record from stored probes. Input order is not assumed.
 *
 * While the address's latest reply is a listing with no agent bound to it,
 * nothing is counted: there is no agent to have answered or failed. Leaving
 * out only the listing replies was not enough: replayed on 26 November, all
 * 22 listed agents in that state still read "Failing" from what else their
 * history held, timeouts of the listing's host and the same listing recorded
 * under older wording before 28 October, when the prober learned to
 * recognise it.
 *
 * Once the address answers as an agent, its probes count again, all but the
 * listing replies, which were never readings of an agent.
 */
export function buildTrackRecord(
  probes: ProbeRecord[],
  now: Date = new Date(),
): TrackRecord {
  const sorted = [...probes].sort((a, b) =>
    a.probedAt.localeCompare(b.probedAt),
  );
  const awaitingAgent = awaitsBoundAgent(sorted);
  const ascending = awaitingAgent ? [] : sorted.filter((probe) => !isAwaitingAgentProbe(probe));

  const firstSeen = ascending[0]?.probedAt ?? null;
  const lastSeen = ascending[ascending.length - 1]?.probedAt ?? null;

  const observedMs =
    firstSeen && lastSeen ? Date.parse(lastSeen) - Date.parse(firstSeen) : 0;

  return {
    windows: WINDOWS.map((w) => summariseWindow(ascending, w, now.getTime())),
    days: bucketByDay(ascending),
    firstSeen,
    lastSeen,
    totalProbes: ascending.length,
    totalAnswered: ascending.filter((p) => p.ok).length,
    longestOutage: findLongestOutage(ascending),
    observedDays: Math.max(0, observedMs / 86_400_000),
    awaitingAgent,
  };
}
