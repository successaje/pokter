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
const SECRET_LABEL = '(?:api[-_]?key|secret|token|password|passphrase|authorization|mnemonic|seed[-_]?phrase|private[-_]?key|key)';

/**
 * A reason that cannot be made safe, and so is not logged at all.
 *
 * Every redacting rule here ends at a newline, because that is where a line
 * ends and none of them parses structure. So in a multi-line message, a
 * secret's value can continue past the point any of them stops — and the
 * earlier version of this only noticed when the label was followed
 * *immediately* by the newline. `password: hunter2\ncontinues-here` defeated
 * it: the label had a value on its own line, so the to-end-of-line rule
 * redacted that much and the continuation survived.
 *
 * Bounding a multi-line value properly means parsing one, and a parser is
 * the thing most likely to be subtly wrong. So the rule is blunt instead: a
 * recognised secret label **anywhere** in a message that has more than one
 * line withholds the whole message. A `-----BEGIN` block goes the same way,
 * on its own, since it may carry no label at all.
 *
 * A single-line message stays bounded by the rules above, and safely: there
 * is no next line for a value to continue onto.
 *
 * What is lost is some readable text in a rare shape. What is kept is the
 * phase, chain, job and category — which is what narrows a cause.
 */
function unboundable(text: string): boolean {
  if (/-----BEGIN/i.test(text)) return true;
  if (!/\r?\n/.test(text)) return false;
  return new RegExp(`\\b${SECRET_LABEL}\\b`, 'i').test(text);
}

/**
 * Strip anything that could carry a credential, or give up and return null.
 *
 * Applied in order, because each rule can expose what the next must catch —
 * a URL path may itself hold a token, so URLs go first.
 *
 *  1. A multi-line message naming any secret label aborts, as does a PEM
 *     block: see `unboundable`. Null, not a partial.
 *  2. URLs become their hostname, or `[url]` when unparseable.
 *  3. A quoted JSON secret loses its value and keeps the rest of the object.
 *     Quotes bound it exactly, so this is the one case where precision is
 *     available and the surrounding fields — a job id, a status — survive.
 *  4. `Bearer <token>` loses the whole token.
 *  5. A labelled secret loses everything to the end of its line.
 *  6. A run of twelve or more short lowercase words goes: twelve is the
 *     shortest BIP-39 phrase.
 *  7. Any 32-byte hex value goes, `0x`-prefixed included. A private key and a
 *     transaction hash are the same shape, so neither survives; the hash
 *     worth keeping arrives through `txHash`, from a transaction result.
 *
 * Addresses — 20 bytes — are left alone. They are public, not key-shaped,
 * and an error naming no address is much harder to act on.
 */
export function sanitiseFailureReason(raw: unknown): string | null {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : String(raw ?? '');
  if (text === '') return '';
  if (unboundable(text)) return null;

  let out = text.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, (match) => hostOnly(match));
  out = out.replace(
    new RegExp(`"${SECRET_LABEL}"\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"`, 'gi'),
    (match) => `${match.slice(0, match.indexOf('"', 1) + 1)}:"[redacted]"`,
  );
  out = out.replace(/\bbearer\s+\S+/gi, 'Bearer [redacted]');
  out = out.replace(
    new RegExp(`\\b(${SECRET_LABEL})\\b\\s*[:=]\\s*.*`, 'gi'),
    (_m, label: string) => `${label}=[redacted]`,
  );
  out = out.replace(
    new RegExp(`\\b[a-z]{3,8}(?:\\s+[a-z]{3,8}){${MNEMONIC_MIN_WORDS - 1},}\\b`, 'g'),
    '[redacted]',
  );
  out = out.replace(/\b(?:0x)?[0-9a-f]{64}\b/gi, '[redacted]');

  const collapsed = out.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_REASON ? `${collapsed.slice(0, MAX_REASON)}\u2026` : collapsed;
}

/**
 * A fixed label for what went wrong, safe because it is never the message.
 *
 * The reason can be withheld — an unboundable secret, or a message that
 * sanitises to nothing useful — and a line with no indication of the failure
 * is barely worth printing. This returns one of a closed set, chosen by
 * matching the message and never quoting it, so a diagnostic stays useful
 * even when the text cannot be shown.
 */
export type ErrorCategory = 'timeout' | 'reverted' | 'rejected' | 'unauthorised' | 'network' | 'not-found' | 'unknown';

export function errorCategory(raw: unknown): ErrorCategory {
  const text = (raw instanceof Error ? `${raw.name} ${raw.message}` : String(raw ?? '')).toLowerCase();
  if (/timeout|timed out|abort/.test(text)) return 'timeout';
  if (/revert|execution failed|out of gas/.test(text)) return 'reverted';
  if (/unauthor|forbidden|401|403|signature|denied/.test(text)) return 'unauthorised';
  if (/rejected|refused/.test(text)) return 'rejected';
  if (/econn|enotfound|dns|socket|network|fetch failed|502|503|504/.test(text)) return 'network';
  if (/not found|404|does not exist/.test(text)) return 'not-found';
  return 'unknown';
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
  const base = `[delivery-retry] chain=${input.chainId} job=${input.jobId} phase=${input.phase} action=${input.action}`;
  const tx = input.txHash ? ` tx=${input.txHash}` : '';
  if (input.reason === undefined) return `${base}${tx} at=${input.at}`;

  /*
   * Category always, reason only when it can be shown. A line that withholds
   * the message still says where the attempt got to and what kind of failure
   * it was, which is the part that narrows a cause; the free text is the part
   * that cannot be trusted.
   */
  const category = ` category=${errorCategory(input.reason)}`;
  const safe = sanitiseFailureReason(input.reason);
  const reason = safe === null ? ' reason=[withheld: could not be bounded]' : safe === '' ? '' : ` reason="${safe}"`;
  return `${base}${category}${reason}${tx} at=${input.at}`;
}
