/**
 * What a failed delivery retry is allowed to say about itself.
 *
 * `deliveryRetries` has failed on every scheduled run since 21 October — 38
 * consecutive failures by 04:12 on the 22nd, with `lastSucceededAt` still
 * null. Four testnet jobs sit FUNDED with no deliverable ever submitted, and
 * three of them expired that way. The reason each attempt gave was captured
 * in the result and then thrown away: nothing persisted it and the
 * scheduler's line prints only the stage name, so the one field that names
 * the cause never left the process.
 *
 * So the reason is logged. Which means it has to be safe to log, because an
 * error from an RPC client carries whatever the transport put in it — and a
 * URL with a key in its path is the ordinary way those are configured.
 *
 * Pure, so the redaction is testable rather than hoped for.
 */

/** Longer than this and a reason is a stack trace, not a reason. */
const MAX_REASON = 200;

/**
 * Strip anything that could carry a credential out of a failure reason.
 *
 * Three rules, in order of how badly each would leak:
 *
 *  - A URL becomes its host. Provider endpoints routinely carry the key in
 *    the path or query (`/v3/<key>`, `?apikey=`), so the path is the part
 *    that must not survive. The host is what makes the error readable.
 *  - A labelled secret becomes the label. Anything following `key`, `secret`,
 *    `token`, `password`, `authorization` or `mnemonic` goes, whatever shape
 *    it has.
 *  - A bare 64-character hex run goes. That is the shape of a private key
 *    with no `0x`, and nothing legitimate in an RPC error looks like it.
 *
 * Deliberately *not* redacted: `0x`-prefixed hashes and addresses. A
 * transaction hash is public, is the thing an operator needs in order to look
 * at what happened, and withholding it would defeat the purpose. A private
 * key written with `0x` is the same shape as a 32-byte hash, so this cannot
 * distinguish them — the protection there is that these strings come from
 * RPC and contract errors, which do not carry signing material, and that no
 * environment value is ever interpolated into one.
 */
export function sanitiseFailureReason(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : String(raw ?? '');
  const withoutUrls = text.replace(/\bhttps?:\/\/([^\s/]+)\S*/gi, (_m, host: string) => `[${host}]`);
  const withoutLabelled = withoutUrls.replace(
    /\b(api[-_]?key|key|secret|token|password|authorization|mnemonic|private[-_]?key)\b\s*[:=]\s*\S+/gi,
    (_m, label: string) => `${label}=[redacted]`,
  );
  const withoutBareHex = withoutLabelled.replace(/\b(?<!0x)[0-9a-f]{64}\b/gi, '[redacted]');
  const collapsed = withoutBareHex.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_REASON ? `${collapsed.slice(0, MAX_REASON)}…` : collapsed;
}

/** Where in a retry the failure happened, which narrows the cause at a glance. */
export type DeliveryPhase = 'read' | 'eligibility' | 'submit';

/**
 * One line per outcome, in a shape that greps.
 *
 * Chain and job identify what; phase and action say how far it got; the
 * reason says why, redacted; and the run timestamp ties it to a sweep. No
 * sweep is forced to produce these — they come from the ordinary scheduled
 * runs, which happen every ten minutes anyway.
 */
export function deliveryDiagnosticLine(input: {
  chainId: number;
  jobId: string;
  phase: DeliveryPhase;
  action: string;
  reason?: unknown;
  at: string;
}): string {
  const reason = input.reason === undefined ? '' : ` reason="${sanitiseFailureReason(input.reason)}"`;
  return `[delivery-retry] chain=${input.chainId} job=${input.jobId} phase=${input.phase} action=${input.action}${reason} at=${input.at}`;
}
