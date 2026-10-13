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

/** Minimum body needed before Pokter treats a feedback receipt as a measurement. */
export function isScorableAttestationBody(body: AttestationBody | null): body is AttestationBody & { tag1: string; method: AttestationMethod } {
  if (!body || typeof body.tag1 !== 'string' || body.tag1.trim().length === 0 || body.tag1.length > 80) return false;
  if (typeof body.agentRegistry !== 'string' || !AGENT_REGISTRY_PATTERN.test(body.agentRegistry)) return false;
  if (!Number.isInteger(body.agentId) || (body.agentId ?? -1) < 0) return false;
  if (typeof body.createdAt !== 'string' || !Number.isFinite(Date.parse(body.createdAt))) return false;
  if (typeof body.reasoning !== 'string' || body.reasoning.trim().length === 0 || body.reasoning.length > 2_000) return false;
  const method = body.method;
  if (!method || !Number.isInteger(method.probes) || (method.probes ?? 0) < 1) return false;
  if (!Number.isInteger(method.answered) || (method.answered ?? -1) < 0 || (method.answered ?? 0) > (method.probes ?? 0)) return false;
  if (typeof method.windowDays !== 'number' || !Number.isFinite(method.windowDays) || method.windowDays < 0) return false;
  if (typeof method.vantage !== 'string' || method.vantage.trim().length === 0 || method.vantage.length > 200) return false;
  if (!Array.isArray(method.knownDefects) || method.knownDefects.length > 20 || method.knownDefects.some((item) => typeof item !== 'string' || item.trim().length === 0 || item.length > 300)) return false;
  return true;
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
  };
}
