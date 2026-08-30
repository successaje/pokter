import type { ScanFeedback } from '@/lib/scan/types';

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
  reasoning: string | null;
  method: AttestationMethod | null;
  createdAt: string | null;
  /** True when the body decoded cleanly — an undecodable receipt is not a receipt. */
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

/** Join a raw feedback row to its decoded attestation. */
export function toAttestation(feedback: ScanFeedback): Attestation {
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
    reasoning: body?.reasoning ?? null,
    method: body?.method ?? null,
    createdAt: body?.createdAt ?? feedback.created_at ?? null,
    verified: body !== null,
  };
}
