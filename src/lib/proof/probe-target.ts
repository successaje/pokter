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

