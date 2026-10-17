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
  return `Did not answer${over}${why ? `: ${why}` : ''}`;
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
  if (check.status === 'paid-only' || check.total === 0) return { text: 'Needs a paid check, not run yet', score: null };
  return { text: `${check.passed} of ${check.total} passed${check.via === 'paid-hire' ? ' (paid hire)' : ''}`, score: check.passed / check.total };
}

/** The protocols it publishes, as declared, never as verified. */
export function declaredProtocols(services: Record<string, unknown> | null | undefined, supported: readonly string[] | null | undefined): string[] {
  const named = Object.keys(services ?? {}).length > 0 ? Object.keys(services ?? {}) : [...(supported ?? [])];
  return [...new Set(named.map((name) => (name.length <= 4 ? name.toUpperCase() : name.toLowerCase())))];
}
