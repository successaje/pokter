import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import type { ScanAgentDetail } from '@/lib/scan/types';
import type { AttestationMethod } from './attestation';

/**
 * Pokter as a measurer.
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
  /** Read-only capabilities observed during the protocol handshake. */
  capabilities?: string[];
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
  capabilities: string[];
  method: AttestationMethod;
}

const PROBE_TIMEOUT_MS = 6_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

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

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}

/** Reject local, credential-bearing and non-HTTPS probe targets before fetch. */
async function assertPublicEndpoint(endpoint: string): Promise<URL> {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Only public HTTPS endpoints without embedded credentials are probed');
  }

  const literal = isIP(url.hostname) ? [url.hostname] : [];
  const addresses = literal.length
    ? literal
    : (await lookup(url.hostname, { all: true, verbatim: true })).map(
        (entry) => entry.address,
      );
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error('Endpoint resolves to a private or reserved network');
  }
  return url;
}

async function readJson(response: Response): Promise<unknown> {
  const announced = Number(response.headers.get('content-length') ?? 0);
  if (announced > MAX_RESPONSE_BYTES) throw new Error('Response is larger than 256 KiB');

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body was empty');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Response is larger than 256 KiB');
    }
    chunks.push(value);
  }

  const text = new TextDecoder().decode(
    chunks.length === 1 ? chunks[0] : Buffer.concat(chunks),
  );
  const payload = response.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split('\n')
        .find((line) => line.startsWith('data:'))
        ?.slice(5)
        .trim()
    : text;
  if (!payload) throw new Error('Response body was empty');
  return JSON.parse(payload) as unknown;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
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

async function probeOnce(
  endpoint: string,
  protocol: 'a2a' | 'mcp',
): Promise<ProbeResult> {
  const startedAt = Date.now();
  const at = new Date().toISOString();

  try {
    const url = await assertPublicEndpoint(endpoint);
    const response = await fetch(url, {
      method: protocol === 'mcp' ? 'POST' : 'GET',
      headers:
        protocol === 'mcp'
          ? {
              accept: 'application/json, text/event-stream',
              'content-type': 'application/json',
              'mcp-protocol-version': '2026-07-28',
              'mcp-method': 'tools/list',
            }
          : { accept: 'application/json' },
      body:
        protocol === 'mcp'
          ? JSON.stringify({
              jsonrpc: '2.0',
              id: 'pokter-capabilities',
              method: 'tools/list',
              params: {
                _meta: {
                  'io.modelcontextprotocol/clientInfo': {
                    name: 'pokter-prober',
                    version: '1.0',
                  },
                },
              },
            })
          : undefined,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
      redirect: 'error',
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

    try {
      const body = asObject(await readJson(response));
      if (!body) {
        return {
          ok: false,
          latencyMs,
          status: response.status,
          detail: 'Endpoint returned 200 but the body was not a JSON object.',
          at,
        };
      }
      const capabilities =
        protocol === 'mcp'
          ? ((asObject(body.result)?.tools as unknown[]) ?? [])
              .map((tool) => asObject(tool)?.name)
              .filter((name): name is string => typeof name === 'string')
          : Array.isArray(body.skills)
            ? body.skills
                .map((skill) => asObject(skill)?.name ?? asObject(skill)?.id)
                .filter((name): name is string => typeof name === 'string')
            : [];
      const valid =
        protocol === 'mcp'
          ? body.jsonrpc === '2.0' && asObject(body.result) !== null && Array.isArray(asObject(body.result)?.tools)
          : typeof body.name === 'string' &&
            typeof body.url === 'string' &&
            typeof body.protocolVersion === 'string' &&
            Array.isArray(body.skills);
      if (!valid) {
        return {
          ok: false,
          latencyMs,
          status: response.status,
          detail: `Endpoint returned JSON, but not a valid ${protocol.toUpperCase()} capability response.`,
          at,
        };
      }
      return {
        ok: true,
        latencyMs,
        status: response.status,
        detail: `${protocol.toUpperCase()} capability handshake succeeded${capabilities.length ? ` with ${capabilities.length} declared ${protocol === 'mcp' ? 'tools' : 'skills'}` : ''}.`,
        capabilities,
        at,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs,
        status: response.status,
        detail: `Endpoint answered, but its ${protocol.toUpperCase()} response was invalid: ${(error as Error).message}.`,
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
  { samples = 1 }: { samples?: number } = {},
): Promise<LiveReading> {
  const target = probeTarget(agent);

  const method: AttestationMethod = {
    measuredBy: 'Pokter',
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
      capabilities: [],
      method: { ...method, probes: 0, answered: 0 },
    };
  }

  const probes: ProbeResult[] = [];
  for (let i = 0; i < samples; i += 1) {
    probes.push(await probeOnce(target.endpoint, target.protocol));
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
    capabilities: [...new Set(probes.flatMap((probe) => probe.capabilities ?? []))],
    method: { ...method, probes: probes.length, answered, medianMs },
  };
}
