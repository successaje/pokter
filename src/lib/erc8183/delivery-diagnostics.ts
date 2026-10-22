/**
 * What a failed delivery retry is allowed to say about itself.
 *
 * `deliveryRetries` has failed on every scheduled run since it was
 * deployed — 38 consecutive failures recorded by 04:12 on 22 October, with
 * `lastSucceededAt` still null. The reason each attempt gave was captured in
 * the result and then discarded with the results array, and the scheduler's
 * line prints the stage name alone, so the one field naming the cause never
 * left the process.
 *
 * So the reason is logged, which means it has to be safe to log: an RPC
 * client's error carries whatever the transport put in it, and a provider URL
 * with the key in its path is the ordinary way those are configured.
 *
 * The rule throughout is **fail closed**. Where a value cannot be told apart
 * from a credential, it goes. A reason that reads oddly costs a minute of
 * puzzlement; a secret in a log costs a rotation at best.
 */

/** Longer than this and a reason is a stack trace, not a reason. */
const MAX_REASON = 200;

/**
 * A run of this many short lowercase words is treated as a mnemonic.
 *
 * The shortest BIP-39 phrase is twelve. An earlier version matched only the
 * exact phrase lengths — 12, 15, 18, 21, 24 — and leaked, because the match
 * is greedy: `signer rejected <twelve words>` is a fourteen-word run, which
 * is not a phrase length, so the phrase passed through intact. The count of
 * a greedy match is a property of the surrounding prose, not of the secret.
 *
 * So any run of twelve or more goes. That catches ordinary sentences of
 * twelve-plus short words too, which is the direction to be wrong in.
 */
const MNEMONIC_MIN_WORDS = 12;

/**
 * A URL reduced to its hostname, or dropped if it will not parse.
 *
 * Parsed rather than pattern-matched, because a regex that "keeps the host"
 * is a regex deciding where a host ends, and it only has to be wrong once.
 * Anything `URL` cannot parse is replaced whole: an unparseable URL-ish
 * string is exactly the case where guessing is worst.
 */
function hostOnly(candidate: string): string {
  try {
    return `[${new URL(candidate).hostname}]`;
  } catch {
    return '[url]';
  }
}

/**
 * Strip anything that could carry a credential out of a failure reason.
 *
 * Applied in order, because each rule can expose what the next must catch —
 * a URL path may itself hold a token, so URLs go first.
 *
 *  1. URLs become their hostname, or `[url]` when unparseable.
 *  2. `Bearer <token>` loses the whole token, not just its first word.
 *  3. A labelled secret loses everything to the end of the line, since a
 *     mnemonic or a PEM block does not stop at the next space.
 *  4. A bare run of twelve or more short lowercase words goes: twelve is the
 *     shortest BIP-39 phrase. It will sometimes catch ordinary prose, and
 *     that is the direction to be wrong in.
 *  5. Any 32-byte hex value goes, **including `0x`-prefixed ones**. A private
 *     key and a transaction hash are the same shape, so nothing here can
 *     tell them apart and neither survives. A hash worth keeping comes from
 *     `txHash` below, which is read from a transaction result rather than
 *     scraped out of prose.
 *
 * Addresses — 20 bytes, 40 hex characters — are left alone. They are public,
 * they are not key-shaped, and an error naming no address is much harder to
 * act on.
 */
export function sanitiseFailureReason(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : String(raw ?? '');

  let out = text.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, (match) => hostOnly(match));
  out = out.replace(/\bbearer\s+\S+/gi, 'Bearer [redacted]');
  out = out.replace(
    /\b(api[-_]?key|secret|token|password|passphrase|authorization|mnemonic|seed[-_]?phrase|private[-_]?key|key)\b\s*[:=]\s*.*/gi,
    (_m, label: string) => `${label}=[redacted]`,
  );
  out = out.replace(
    new RegExp(`\\b[a-z]{3,8}(?:\\s+[a-z]{3,8}){${MNEMONIC_MIN_WORDS - 1},}\\b`, 'g'),
    '[redacted]',
  );
  out = out.replace(/\b(?:0x)?[0-9a-f]{64}\b/gi, '[redacted]');

  const collapsed = out.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_REASON ? `${collapsed.slice(0, MAX_REASON)}…` : collapsed;
}

/** Where in a retry the failure happened, which narrows the cause at a glance. */
export type DeliveryPhase = 'read' | 'eligibility' | 'submit';

/**
 * One line per outcome, in a shape that greps.
 *
 * `txHash` is a separate field on purpose. The sanitiser above cannot keep a
 * hash out of a free-form string without also keeping a key, so it keeps
 * neither — and the hash an operator actually needs comes from here instead,
 * read from a transaction result (`DemoDeliveryResult.submitTxHash`) rather
 * than found in prose. A hash that came from a result is a hash; one found in
 * an error message is a 32-byte hex value of unknown provenance.
 */
export function deliveryDiagnosticLine(input: {
  chainId: number;
  jobId: string;
  phase: DeliveryPhase;
  action: string;
  reason?: unknown;
  /** Only ever from a transaction result. Never parsed out of an error. */
  txHash?: `0x${string}` | null;
  at: string;
}): string {
  const reason = input.reason === undefined ? '' : ` reason="${sanitiseFailureReason(input.reason)}"`;
  const tx = input.txHash ? ` tx=${input.txHash}` : '';
  return `[delivery-retry] chain=${input.chainId} job=${input.jobId} phase=${input.phase} action=${input.action}${reason}${tx} at=${input.at}`;
}
