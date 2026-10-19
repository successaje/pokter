/**
 * What is typical on Pokter, so an agent's own figures have something to be
 * read against.
 *
 * "Replies 64%" says little on its own: it is good if most agents answer
 * half their checks and poor if most answer all of them. Each figure here
 * is the median across listed agents that have the reading at all, with the
 * number of agents behind it, so the comparison carries its own denominator.
 *
 * Medians, not means: a handful of agents that never answer would drag a
 * mean down and make every working agent look above average.
 *
 * A figure is withheld below `MIN_AGENTS`. A median of three agents is not a
 * norm, and printing it beside an agent's number would present it as one.
 */
export const MIN_AGENTS = 5;
/** Lifetime checks an agent needs before its reply rate counts towards the median. */
export const MIN_PROBES = 10;

export interface BenchmarkStat {
  median: number;
  agents: number;
}

export interface PlatformBenchmark {
  /** Share of Pokter's checks answered, lifetime. */
  replyRate: BenchmarkStat | null;
  /** Median reply time over the last 30 days, in milliseconds. */
  replyMs: BenchmarkStat | null;
  /** Share of finished paid jobs that settled, out of settled plus missed. */
  settledRate: BenchmarkStat | null;
}

export interface BenchmarkInput {
  record: { totalProbes: number; totalAnswered: number; windows: Array<{ label: string; medianMs: number | null }> };
  history?: { completed: number; missed: number };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The agent's own readings, by the same rules as the medians, so the two are like for like. */
export function agentReadings(entry: BenchmarkInput): { replyRate: number | null; replyMs: number | null; settledRate: number | null } {
  const { record, history } = entry;
  const finished = history ? history.completed + history.missed : 0;
  return {
    replyRate: record.totalProbes >= MIN_PROBES ? record.totalAnswered / record.totalProbes : null,
    replyMs: record.windows.find((w) => w.label === '30d')?.medianMs ?? null,
    settledRate: history && finished > 0 ? history.completed / finished : null,
  };
}

function stat(values: Array<number | null>): BenchmarkStat | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length < MIN_AGENTS) return null;
  return { median: median(present)!, agents: present.length };
}

export function platformBenchmark(entries: readonly BenchmarkInput[]): PlatformBenchmark {
  const readings = entries.map(agentReadings);
  return {
    replyRate: stat(readings.map((r) => r.replyRate)),
    replyMs: stat(readings.map((r) => r.replyMs)),
    settledRate: stat(readings.map((r) => r.settledRate)),
  };
}
