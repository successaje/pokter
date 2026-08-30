import 'server-only';

import type { ScanAgentDetail } from '@/lib/scan/types';
import type { AttestationMethod } from './attestation';

/**
 * Proving Ground as a measurer.
 *
 * The BSC registry holds hundreds of thousands of agents and almost none carry
 * attestations, so a marketplace that only *reads* evidence would have nothing
 * to show. We therefore produce first-party evidence: probe the endpoint an
 * agent publishes and record whether it actually answers.
 *
 * This mirrors how existing measurers (Kawal, GEBO) work, and it commits us to
 * the same standard we hold them to — the methodology below, including its
 * defects, is published alongside every reading.
 */

/** A probe counts as answered only on a well-formed protocol response. */
export interface ProbeResult {
  ok: boolean;
  latencyMs: number | null;
  /** HTTP status, or null when the request never completed. */
  status: number | null;
  /** Why a probe failed, in plain language. */
  detail: string;
  at: string;
}

export interface LiveReading {
  endpoint: string | null;
  protocol: 'a2a' | 'mcp' | 'none';
  probes: ProbeResult[];
  answered: number;
  /** 0..1, or null when no probe completed. */
  ratio: number | null;
  medianMs: number | null;
  method: AttestationMethod;
}

const PROBE_TIMEOUT_MS = 6_000;

/**
 * Defects we know our own method has. Publishing these is the point: a receipt
 * that hides its limits is marketing, not evidence.
 */
const KNOWN_DEFECTS = [
  'Single vantage point: an agent that geo-blocks or ASN-blocks this prober appears unreachable when it may be healthy.',
  'Cannot distinguish "the agent is down" from "unreachable from here".',
  'Liveness is not correctness: an agent that answers every probe may still trade badly.',
  'Probes run on demand rather than on a schedule, so samples are not evenly spaced in time.',
];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** Resolve the endpoint we can actually probe, preferring A2A over MCP. */
export function probeTarget(
  agent: ScanAgentDetail,
): { endpoint: string; protocol: 'a2a' | 'mcp' } | null {
  const services = agent.services ?? {};
  for (const protocol of ['a2a', 'mcp'] as const) {
    const endpoint = services[protocol]?.endpoint;
    if (!endpoint) continue;

    // Registry entries sometimes ship an unexpanded template placeholder.
    const resolved = endpoint.replace('{agentId}', agent.token_id);
    if (resolved.includes('{') || !resolved.startsWith('https://')) continue;

    return { endpoint: resolved, protocol };
  }
  return null;
}

async function probeOnce(endpoint: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  const at = new Date().toISOString();

  try {
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        status: response.status,
        detail: `Endpoint answered ${response.status} ${response.statusText}.`,
        at,
      };
    }

    // An HTTP 200 alone is not an answer — the body must be usable JSON.
    // Plenty of dead agents sit behind a proxy that returns a 200 HTML page.
    try {
      const body = (await response.json()) as unknown;
      if (typeof body !== 'object' || body === null) {
        return {
          ok: false,
          latencyMs,
          status: response.status,
          detail: 'Endpoint returned 200 but the body was not a JSON object.',
          at,
        };
      }
      return {
        ok: true,
        latencyMs,
        status: response.status,
        detail: 'Endpoint served a well-formed JSON response.',
        at,
      };
    } catch {
      return {
        ok: false,
        latencyMs,
        status: response.status,
        detail: 'Endpoint returned 200 but the body was not valid JSON.',
        at,
      };
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      latencyMs: null,
      status: null,
      detail: timedOut
        ? `No response within ${PROBE_TIMEOUT_MS / 1000}s.`
        : `Request failed: ${(error as Error).message}.`,
      at,
    };
  }
}

/**
 * Probe an agent live. Returns a reading in the same shape as the on-chain
 * attestations we read, so the UI renders first- and third-party evidence
 * through one code path.
 */
export async function probeAgent(
  agent: ScanAgentDetail,
  { samples = 3 }: { samples?: number } = {},
): Promise<LiveReading> {
  const target = probeTarget(agent);

  const method: AttestationMethod = {
    measuredBy: 'Proving Ground',
    protocol: target?.protocol,
    windowDays: 0,
    vantage: 'single region',
    knownDefects: KNOWN_DEFECTS,
  };

  if (!target) {
    return {
      endpoint: null,
      protocol: 'none',
      probes: [],
      answered: 0,
      ratio: null,
      medianMs: null,
      method: { ...method, probes: 0, answered: 0 },
    };
  }

  const probes: ProbeResult[] = [];
  for (let i = 0; i < samples; i += 1) {
    probes.push(await probeOnce(target.endpoint));
  }

  const answered = probes.filter((p) => p.ok).length;
  const medianMs = median(
    probes.filter((p) => p.ok && p.latencyMs !== null).map((p) => p.latencyMs as number),
  );

  return {
    endpoint: target.endpoint,
    protocol: target.protocol,
    probes,
    answered,
    ratio: probes.length === 0 ? null : answered / probes.length,
    medianMs,
    method: { ...method, probes: probes.length, answered, medianMs },
  };
}
