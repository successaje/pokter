/*
 * Plain-language readings for the compare rows, from data Pokter holds.
 * Each says what was observed, and says "unknown" rather than guess.
 */

/** Whether the agent signs with a key separate from its owner's wallet. */
export function custodyOf(agentWallet: string | null | undefined, owner: string | null | undefined): { text: string; separate: boolean | null } {
  if (!agentWallet || !owner) return { text: 'Not known: no agent wallet registered', separate: null };
  return agentWallet.toLowerCase() === owner.toLowerCase()
    ? { text: 'Signs with its owner’s own wallet', separate: false }
    : { text: 'Signs with a key separate from its owner', separate: true };
}

/** The latest probe, as a sentence. */
export function endpointReading(probe: { ok: boolean; latencyMs: number | null; protocol: string; detail: string } | null): string {
  if (!probe) return 'Not probed yet';
  const over = probe.protocol ? ` over ${probe.protocol.toUpperCase()}` : '';
  if (probe.ok) return `Answered${probe.latencyMs !== null ? ` in ${probe.latencyMs} ms` : ''}${over}`;
  const why = probe.detail.trim().split(/[.;\n]/)[0]?.slice(0, 80);
  /* A detail that only says it did not answer adds nothing to "Did not answer". */
  return `Did not answer${over}${why && !/^no (answer|response)$/i.test(why.trim()) ? `: ${why}` : ''}`;
}

/** How long ago, coarse on purpose: a compare is read in minutes, not seconds. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never';
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** A correctness check, as passed of total, or why there is no score. */
export function checkReading(check: { passed: number; total: number; status: string; via: string } | null): { text: string; score: number | null } {
  if (!check) return { text: 'Not checked yet', score: null };
  if (check.status === 'not-askable') return { text: 'Could not be asked', score: null };
  if (check.status === 'paid-only') return { text: 'Needs a paid check, not run yet', score: null };
  if (check.total === 0) return { text: check.via === 'paid-hire' ? 'Delivered, but none of it could be graded' : 'Answered, but none of it could be graded', score: null };
  return { text: `${check.passed} of ${check.total} passed${check.via === 'paid-hire' ? ' (paid hire)' : ''}`, score: check.passed / check.total };
}

/** The protocols it publishes, as declared, never as verified. */
export function declaredProtocols(services: Record<string, unknown> | null | undefined, supported: readonly string[] | null | undefined): string[] {
  const named = Object.keys(services ?? {}).length > 0 ? Object.keys(services ?? {}) : [...(supported ?? [])];
  return [...new Set(named.map((name) => (name.length <= 4 ? name.toUpperCase() : name.toLowerCase())))];
}

/**
 * Percentages written with just enough precision to tell distinct rates
 * apart, and the numbers to rank them by, rounded the same way.
 *
 * Two agents at 99.4% and 98.6% both read "99%" and one was marked Best:
 * the page claimed a difference it did not show. Rates that differ get a
 * decimal place (two at most) until they read differently; rates that
 * read the same rank the same, so a displayed tie is a tie.
 */
export function distinctPercents(rates: ReadonlyArray<number | null>): { labels: Array<string | null>; ranked: Array<number | null> } {
  const present = rates.filter((r): r is number => r !== null && Number.isFinite(r));
  let digits = 0;
  for (; digits < 2; digits += 1) {
    const shown = new Set(present.map((r) => (r * 100).toFixed(digits)));
    const actual = new Set(present);
    if (shown.size === actual.size) break;
  }
  return {
    labels: rates.map((r) => (r === null || !Number.isFinite(r) ? null : `${(r * 100).toFixed(digits)}%`)),
    ranked: rates.map((r) => (r === null || !Number.isFinite(r) ? null : Number((r * 100).toFixed(digits)))),
  };
}

/** A correctness result as a pass, a failure or neither, so it can be marked as plainly as availability is. */
export function checkTone(check: { passed: number; total: number; status: string } | null): 'pass' | 'fail' | 'none' {
  if (!check || check.total === 0 || check.status === 'not-askable' || check.status === 'paid-only') return 'none';
  return check.passed === check.total ? 'pass' : 'fail';
}
