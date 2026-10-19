import type { ScanAgentDetail } from '@/lib/scan/types';

/**
 * Which endpoint Pokter probes, and which protocol revision it speaks.
 *
 * Pure, and kept out of `prober.ts`, which is `server-only` and so cannot
 * be imported by a test. This is the part that decides whether a working
 * agent is recorded as answering at all.
 */

/**
 * The MCP revision Pokter speaks when an agent does not say which it does.
 *
 * Only a fallback. The handshake used to send this to every MCP agent
 * regardless of what the registry said, and an agent implementing an
 * earlier revision answers 400: HeyAnon's three agents declare
 * 2025-06-18 and were recorded as not answering for it, with a message
 * blaming params._meta that is wrong about its own cause. The registry
 * record names the revision the agent speaks, so the probe uses that and
 * falls back here only when none is declared.
 */
export const MCP_PROTOCOL_VERSION = '2026-07-28';

/**
 * Which revision of Pokter's own probe took a measurement. Stored on every
 * probe row, so a fault later found in the probe can be tied to the rows it
 * produced instead of inferred from dates. Bump it whenever the way an
 * agent is called changes.
 */
export const PROBE_ADAPTER = '2026-10-15.declared-mcp-revision';

export function probeTarget(
  agent: ScanAgentDetail,
): { endpoint: string; protocol: 'a2a' | 'mcp'; version: string | null } | null {
  const services = agent.services ?? {};
  for (const protocol of ['a2a', 'mcp'] as const) {
    const service = services[protocol];
    const endpoint = service?.endpoint;
    if (!endpoint) continue;

    // Registry entries sometimes ship an unexpanded template placeholder.
    const resolved = endpoint.replace('{agentId}', agent.token_id);
    if (resolved.includes('{') || !resolved.startsWith('https://')) continue;

    const declared = (service as { version?: unknown }).version;
    return {
      endpoint: resolved,
      protocol,
      version: typeof declared === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(declared) ? declared : null,
    };
  }
  return null;
}


/**
 * Whether a probe counts as evidence about the agent, or about us.
 *
 * Threading the run's cancellation into the probe request — so that
 * abandoning a sweep stops the calls rather than only stopping the wait —
 * means an abort now returns through the same path a refusal does: `ok:
 * false`, with a detail that reads as the endpoint's fault. And when the
 * abort comes from the run's wall-clock budget it arrives as a
 * `TimeoutError`, which is precisely what a genuinely slow agent produces.
 *
 * So the error cannot be the test; only the identity of the signal can.
 * If our own signal has fired and the probe did not succeed, this run
 * stopped asking and nothing was measured — an endpoint Pokter cannot reach
 * is Pokter's gap, not the agent's finding, and never more so than when the
 * reason is that Pokter gave up. A sample that had already succeeded is kept,
 * because it is a real reading whatever became of the run around it.
 *
 * Here rather than inside the prober so it can be tested: the prober is
 * `server-only`, and a rule this easy to get backwards should be covered by
 * something that runs.
 */
export function probeIsEvidence(probe: { ok: boolean }, signal?: AbortSignal | null): boolean {
  return !(signal?.aborted && !probe.ok);
}
