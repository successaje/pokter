import type { ScanFeedback } from '@/lib/scan/types';
import type { ResolvedAttestationAuthor, AttestationIndependence } from './attestation-authors';

/**
 * The measurement methodology embedded in an attestation. Measurers publish this
 * alongside the score, including the defects they know their own method has —
 * which is what makes a receipt honest rather than just a number.
 */
export interface AttestationMethod {
  measuredBy?: string;
  protocol?: string;
  probes?: number;
  answered?: number;
  windowDays?: number;
  medianMs?: number | null;
  vantage?: string;
  knownDefects?: string[];
}

/** The decoded body of a `feedback_uri` data URI. */
export interface AttestationBody {
  agentRegistry?: string;
  agentId?: number;
  createdAt?: string;
  value?: string;
  valueDecimals?: number;
  /** Primary dimension, e.g. "uptime". */
  tag1?: string;
  /** Measurement window, e.g. "1d". */
  tag2?: string;
  endpoint?: string;
  reasoning?: string;
  method?: AttestationMethod;
}

const AGENT_REGISTRY_PATTERN = /^eip155:(56|97):0x[0-9a-fA-F]{40}$/;

/** A feedback row joined to its decoded body and normalised score. */
export interface Attestation {
  id: string;
  agentId: string;
  chainId: number;
  transactionHash: string | null;
  blockNumber: number | null;
  /** Normalised to 0..1, or null when the attestation carries no value. */
  ratio: number | null;
  dimension: string;
  window: string | null;
  measuredBy: string | null;
  /** Transaction sender, read from chain rather than trusted from the body. */
  authorAddress: string | null;
  /** Whether that sender is unrelated to the agent owner and Pokter. */
  independence: AttestationIndependence;
  reasoning: string | null;
  method: AttestationMethod | null;
  createdAt: string | null;
  /** True when the body contains Pokter's minimum reproducible measurement fields. */
  verified: boolean;
  /** The fields that stopped it being scored, empty when `verified`. */
  missing: string[];
}

const DATA_URI_PREFIX = 'data:application/json;base64,';

function decodeBase64(input: string): string | null {
  try {
    // Buffer on the server, atob in the browser — this module runs in both.
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(input, 'base64').toString('utf8');
    }
    return atob(input);
  } catch {
    return null;
  }
}

/** Decode the base64 JSON body of a `feedback_uri`, or null if malformed. */
export function decodeAttestationUri(uri: string | null): AttestationBody | null {
  if (!uri || !uri.startsWith(DATA_URI_PREFIX)) return null;

  const json = decodeBase64(uri.slice(DATA_URI_PREFIX.length));
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as AttestationBody;
  } catch {
    return null;
  }
}

/**
 * Normalise an attestation's value to 0..1.
 *
 * Values arrive as decimal strings scaled by `value_decimals` — a "100% uptime"
 * reading is `value: "1E+4"` with `value_decimals: 2`, i.e. 10000 basis points.
 * The scale is therefore `10 ** (decimals + 2)`.
 */
export function normaliseValue(
  value: string | null | undefined,
  decimals: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  const scale = 10 ** ((decimals ?? 0) + 2);
  if (scale <= 0) return null;

  // Clamp: a measurer could publish out-of-range values, and we would rather
  // show a capped number than a nonsensical one.
  return Math.min(1, Math.max(0, numeric / scale));
}

/**
 * Which of Pokter's minimum measurement fields a body does not satisfy, named
 * as the schema names them so an author can map a gap to a key they control.
 *
 * This is the only place the rule is written. `isScorableAttestationBody` is
 * defined as "no gaps", so a receipt can never be refused for a reason the
 * page cannot name, and the two can never drift apart.
 */
export function attestationGaps(body: AttestationBody | null): string[] {
  if (!body) return ['agentRegistry', 'agentId', 'createdAt', 'tag1', 'reasoning', 'method'];
  const gaps: string[] = [];
  const str = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

  if (typeof body.agentRegistry !== 'string' || !AGENT_REGISTRY_PATTERN.test(body.agentRegistry)) gaps.push('agentRegistry');
  if (!Number.isInteger(body.agentId) || (body.agentId ?? -1) < 0) gaps.push('agentId');
  if (typeof body.createdAt !== 'string' || !Number.isFinite(Date.parse(body.createdAt))) gaps.push('createdAt');
  if (!str(body.tag1, 80)) gaps.push('tag1');
  if (!str(body.reasoning, 2_000)) gaps.push('reasoning');

  const method = body.method;
  if (!method) return [...gaps, 'method'];
  if (!Number.isInteger(method.probes) || (method.probes ?? 0) < 1) gaps.push('method.probes');
  if (!Number.isInteger(method.answered) || (method.answered ?? -1) < 0 || (method.answered ?? 0) > (method.probes ?? 0)) gaps.push('method.answered');
  if (typeof method.windowDays !== 'number' || !Number.isFinite(method.windowDays) || method.windowDays < 0) gaps.push('method.windowDays');
  if (!str(method.vantage, 200)) gaps.push('method.vantage');
  if (!Array.isArray(method.knownDefects) || method.knownDefects.length > 20 || method.knownDefects.some((item) => !str(item, 300))) gaps.push('method.knownDefects');
  return gaps;
}

/** Minimum body needed before Pokter treats a feedback receipt as a measurement. */
export function isScorableAttestationBody(body: AttestationBody | null): body is AttestationBody & { tag1: string; method: AttestationMethod } {
  return attestationGaps(body).length === 0;
}

/** Join a raw feedback row to its decoded attestation. */
export function toAttestation(feedback: ScanFeedback, author?: ResolvedAttestationAuthor): Attestation {
  const body = decodeAttestationUri(feedback.feedback_uri);

  const ratio =
    normaliseValue(feedback.value, feedback.value_decimals) ??
    normaliseValue(body?.value, body?.valueDecimals);

  return {
    id: feedback.id,
    agentId: feedback.agent_id,
    chainId: feedback.chain_id,
    transactionHash: feedback.transaction_hash,
    blockNumber: feedback.block_number,
    ratio,
    dimension: body?.tag1 ?? 'unspecified',
    window: body?.tag2 ?? null,
    measuredBy: body?.method?.measuredBy ?? null,
    authorAddress: author?.address ?? null,
    independence: author?.independence ?? 'undetermined',
    reasoning: body?.reasoning ?? null,
    method: body?.method ?? null,
    createdAt: body?.createdAt ?? feedback.created_at ?? null,
    verified: isScorableAttestationBody(body),
    missing: attestationGaps(body),
  };
}
