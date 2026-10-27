import 'server-only';

import { MCP_PROTOCOL_VERSION, probeIsEvidence, probeTarget } from '@/lib/proof/probe-target';

export { MCP_PROTOCOL_VERSION, probeTarget };

import { a2aCardFallback, cardRequiresAuth } from './card-access';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent } from 'undici';

import type { ScanAgentDetail } from '@/lib/scan/types';
import type { AttestationMethod } from './attestation';
import { readRpcResponse } from '@/lib/protocol/stream';
import { deadlineSignal } from '@/lib/net/bounded';
import { listMcpTools, type McpTool } from '@/lib/mcp/probe';
import { isAgentCard, jsonRpcInterface } from '@/lib/a2a/card';
import { negotiationSkillOf } from '@/lib/erc8183/courier-parse';

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
  /**
   * The skill a price request would be sent to, chosen exactly as the
   * requester chooses it (`negotiationSkillOf`, by id), or null. The list
   * above is by display name, and a card's `{ id: 'negotiate', name:
   * 'Negotiate price' }` is quoted by id: judging readiness from the name
   * told such a builder it had no negotiate skill.
   */
  negotiationSkill?: string | null;
  /** Skill ids, then names where a skill has no id, for naming a misnamed pricing skill. */
  skillIds?: string[];
  /** The A2A version of the JSON-RPC interface Pokter would call, when the card states one. */
  a2aVersion?: string | null;
  /** The A2A card says its endpoint needs credentials (see `cardRequiresAuth`). */
  requiresAuth?: boolean;
  /** MCP tools as declared, input schemas included (see `listMcpTools`). */
  tools?: McpTool[];
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
  /** MCP tools with their input schemas, from the first probe that listed them. */
  tools: McpTool[];
  /** A card read on this visit said its endpoint needs credentials. */
  requiresAuth: boolean;
  method: AttestationMethod;
}

// A2A Agent Cards on small seller runtimes regularly cold-start just beyond
// six seconds. Ten seconds still bounds the page while avoiding false
// "not responding" verdicts for endpoints that complete a valid handshake.
const PROBE_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * Defects we know our own method has. Publishing these is the point: a receipt
 * that hides its limits is marketing, not evidence.
 */
const KNOWN_DEFECTS = [
  'Single vantage point: an agent that geo-blocks or ASN-blocks this prober appears unreachable when it may be healthy.',
  'Cannot distinguish "the agent is down" from "unreachable from here".',
  'Liveness is not correctness: an agent that answers every probe may still trade badly.',
  'A live check is one call made when a page loads: it says the agent answers now, not that it stays up. Sustained availability comes from the two-hourly sweeps.',
];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/**
 * The IPv4 address inside an IPv4-mapped IPv6 one, or null.
 *
 * Both spellings are accepted because both resolve to the same host:
 * `::ffff:169.254.169.254` and `::ffff:a9fe:a9fe` are the cloud metadata
 * endpoint either way. Matching mapped ranges as text misses whichever
 * spelling the list forgot, so the address is unwrapped and run through the
 * IPv4 rules instead.
 */
function mappedIpv4(normalized: string): string | null {
  const dotted = /^(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (dotted) return dotted[1];

  const hex = /^(?:::ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);

  const normalized = address.toLowerCase();

  const mapped = mappedIpv4(normalized);
  if (mapped) return isPrivateIpv4(mapped);

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

/** Reject local, credential-bearing and non-HTTPS probe targets before fetch. */
/**
 * A validated endpoint, and the only way to call it.
 *
 * POK-008. Resolving, checking, then letting `fetch` resolve again leaves a
 * window: a host can answer with a public address on the first lookup and a
 * private one on the second, and the check protects nothing.
 *
 * The connection is pinned to the address that was inspected. `fetch` is
 * exposed as a method rather than the dispatcher as a field on purpose — a
 * caller who reached for `.url` and a bare `fetch` would silently reopen the
 * window, and this way the pin cannot be dropped by accident.
 */
export interface PinnedEndpoint {
  url: URL;
  fetch(init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

export async function assertPublicEndpoint(
  endpoint: string,
): Promise<PinnedEndpoint> {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Only public HTTPS endpoints without embedded credentials are probed');
  }

  /*
   * `url.hostname` keeps the brackets on an IPv6 literal, so `[::1]` is not
   * recognised as an IP and falls through to a DNS lookup that happens to
   * fail. That blocked the right addresses for the wrong reason — and it
   * rejected public IPv6 literals too. Unwrapping makes the decision the
   * private-range check's to make.
   */
  const hostname = url.hostname.replace(/^\[(.+)\]$/, '$1');

  const literal = isIP(hostname) ? [hostname] : [];
  const addresses = literal.length
    ? literal
    : (await lookup(url.hostname, { all: true, verbatim: true })).map(
        (entry) => entry.address,
      );
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error('Endpoint resolves to a private or reserved network');
  }

  const [pinned] = addresses;
  const dispatcher = new Agent({
    connect: {
      // Hand back the address already checked instead of resolving again.
      lookup: (_hostname, options, callback) => {
        const family = isIP(pinned);
        if (options.all) {
          callback(null, [{ address: pinned, family }] as never);
          return;
        }
        callback(null, pinned as never, family as never);
      },
    },
  });

  return {
    url,
    fetch: (init?: RequestInit) =>
      fetch(url, { ...init, dispatcher } as RequestInit),
    close: () => dispatcher.close(),
  };
}

/** Run all work while the DNS-pinned dispatcher is owned, then release it. */
export async function withPublicEndpoint<T>(
  endpoint: string,
  work: (handle: PinnedEndpoint) => Promise<T>,
): Promise<T> {
  const handle = await assertPublicEndpoint(endpoint);
  try {
    return await work(handle);
  } finally {
    await handle.close();
  }
}

/**
 * A JSON body, or the awaited JSON-RPC response in an event stream, read
 * within the size limit. See `readRpcResponse`: pass the request's id when
 * there is one, so an event for another message is never taken as its answer.
 */
export async function readJson(response: Response, { expectId }: { expectId?: string | number } = {}): Promise<unknown> {
  return readRpcResponse(response, { expectId, maxBytes: MAX_RESPONSE_BYTES });
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Resolve the endpoint we can actually probe, preferring A2A over MCP. */
/**
 * One probe. For A2A, an endpoint that answers with something other than an
 * agent card is given one more chance at the card's location (see
 * `a2aCardFallback`): builders often publish their base URL, and the A2A
 * specification puts the card at a well-known path under it.
 */
async function probeOnce(
  endpoint: string,
  protocol: 'a2a' | 'mcp',
  version: string | null = null,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const { result, body } = await probeAt(endpoint, protocol, version, signal);
  // Only an endpoint that answered: an unreachable host has no card either.
  if (protocol !== 'a2a' || result.ok || result.status === null) return result;
  const card = a2aCardFallback(endpoint, body);
  if (!card) return result;
  // The fallback is a second call, so a cancelled probe must not make it.
  if (signal?.aborted) return result;
  const retried = (await probeAt(card, protocol, version, signal)).result;
  if (!retried.ok) return result;
  return {
    ...retried,
    detail: `${retried.detail} Read from ${card}, because ${endpoint} is not itself an agent card; publishing the card's URL as the endpoint saves a call.`,
  };
}

async function probeAt(
  endpoint: string,
  protocol: 'a2a' | 'mcp',
  version: string | null = null,
  signal?: AbortSignal,
): Promise<{ result: ProbeResult; body?: Record<string, unknown> }> {
  const startedAt = Date.now();
  const at = new Date().toISOString();
  let endpointHandle: PinnedEndpoint | null = null;

  try {
    endpointHandle = await assertPublicEndpoint(endpoint);
    if (protocol === 'mcp') {
      const handle = endpointHandle;
      const listing = await listMcpTools(
        (init) => handle.fetch({ ...init, signal: deadlineSignal(PROBE_TIMEOUT_MS, signal), cache: 'no-store', redirect: 'error' }),
        { version, maxBytes: MAX_RESPONSE_BYTES },
      );
      return {
        result: {
          ok: listing.ok,
          latencyMs: Date.now() - startedAt,
          status: listing.status,
          detail: listing.detail,
          capabilities: listing.tools.map((tool) => tool.name),
          tools: listing.tools,
          requiresAuth: false,
          at,
        },
      };
    }
    const response = await endpointHandle.fetch({
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: deadlineSignal(PROBE_TIMEOUT_MS, signal),
      cache: 'no-store',
      redirect: 'error',
    });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        result: {
          ok: false,
          latencyMs,
          status: response.status,
          detail: `Endpoint answered ${response.status} ${response.statusText}.`,
          at,
        },
      };
    }

    try {
      const body = asObject(await readJson(response));
      if (!body) {
        return {
          result: {
            ok: false,
            latencyMs,
            status: response.status,
            detail: 'Endpoint returned 200 but the body was not a JSON object.',
            at,
          },
        };
      }
      const capabilities = Array.isArray(body.skills)
        ? body.skills
            .map((skill) => asObject(skill)?.name ?? asObject(skill)?.id)
            .filter((name): name is string => typeof name === 'string')
        : [];
      // Either card format: a top-level url (to v0.3) or supportedInterfaces (current).
      if (!isAgentCard(body)) {
        return {
          result: {
            ok: false,
            latencyMs,
            status: response.status,
            detail: 'Endpoint returned JSON, but not a valid A2A agent card.',
            at,
          },
          body,
        };
      }
      const callable = jsonRpcInterface(body);
      const skills = Array.isArray(body.skills) ? body.skills : [];
      return {
        result: {
          ok: true,
          latencyMs,
          status: response.status,
          detail: `A2A capability handshake succeeded${capabilities.length ? ` with ${capabilities.length} declared skills` : ''}.${callable ? '' : ' Its card offers no HTTPS JSON-RPC interface, which is the one Pokter calls, so it cannot be quoted or hired here.'}`,
          capabilities,
          negotiationSkill: negotiationSkillOf(skills),
          skillIds: skills.map((skill) => asObject(skill)?.id ?? asObject(skill)?.name).filter((id): id is string => typeof id === 'string'),
          a2aVersion: callable?.version ?? null,
          requiresAuth: cardRequiresAuth(body),
          at,
        },
      };
    } catch (error) {
      return {
        result: {
          ok: false,
          latencyMs,
          status: response.status,
          detail: `Endpoint answered, but its ${protocol.toUpperCase()} response was invalid: ${(error as Error).message}.`,
          at,
        },
      };
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return {
      result: {
        ok: false,
        latencyMs: null,
        status: null,
        detail: timedOut
          ? `No response within ${PROBE_TIMEOUT_MS / 1000}s.`
          : `Request failed: ${(error as Error).message}.`,
        at,
      },
    };
  } finally {
    await endpointHandle?.close();
  }
}

/**
 * Preflight one unpublished endpoint with the exact handshake used by the
 * marketplace sweeper. Keeping this wrapper here prevents Builder Studio from
 * drifting into a friendlier-but-incompatible definition of "ready".
 */
export async function probeEndpoint(
  endpoint: string,
  protocol: 'a2a' | 'mcp',
  version: string | null = null,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  return probeOnce(endpoint, protocol, version, signal);
}

/**
 * Probe an agent live. Returns a reading in the same shape as the on-chain
 * attestations we read, so the UI renders first- and third-party evidence
 * through one code path.
 */
export async function probeAgent(
  agent: ScanAgentDetail,
  {
    samples = 1,
    signal,
  }: {
    samples?: number;
    /**
     * The caller's cancellation, passed down to every request.
     *
     * A sweep is reached through a request, and when that request goes away
     * the probes behind it should stop rather than carrying on against a
     * third party's endpoint for nobody. The samples loop checks it too: a
     * cancelled probe must not start its second sample, which abandoning the
     * *wait* would not have prevented.
     */
    signal?: AbortSignal;
  } = {},
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
      tools: [],
      requiresAuth: false,
      method: { ...method, probes: 0, answered: 0 },
    };
  }

  const probes: ProbeResult[] = [];
  for (let i = 0; i < samples; i += 1) {
    if (signal?.aborted) break;
    const probe = await probeOnce(target.endpoint, target.protocol, target.version, signal);
    /*
     * Our own cancellation is not a finding about the agent — see
     * `probeIsEvidence`. A dropped sample means this run measured fewer of
     * them; the stalest-first ordering sends the next run straight back here.
     */
    if (!probeIsEvidence(probe, signal)) break;
    probes.push(probe);
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
    tools: probes.find((probe) => probe.tools?.length)?.tools ?? [],
    requiresAuth: probes.some((probe) => probe.requiresAuth === true),
    method: { ...method, probes: probes.length, answered, medianMs },
  };
}
