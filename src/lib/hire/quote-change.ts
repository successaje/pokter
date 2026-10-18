/**
 * What changed between the quote a buyer reviewed and the one about to be funded.
 *
 * A quote that expires between Review and Pay is renegotiated, and the
 * replacement was accepted whenever its price matched. Price is not the
 * only signed term: `deliverables`, `quality_standards` and
 * `success_criteria` are inside the hash too, and an agent can return the
 * same number for materially less work. Funding that is the buyer paying
 * for terms they never read.
 *
 * Currency counts for the same reason, and more sharply — the same figure
 * in a different token is a different price.
 *
 * Deliberately not a hash comparison. The signed content carries
 * `negotiated_at` and `quote_expires_at`, so every renewal has a different
 * hash by construction and comparing hashes would stop every hire whose
 * quote merely aged.
 */
/**
 * The least a quote must carry to be compared. `AgentQuote` and the
 * envelope's `PokterJobQuote` both satisfy it, and neither has to be
 * converted at the call site; `currency` lives inside the signed anchor
 * on one of them, so it is read from there for both.
 */
export interface ComparableQuote {
  priceRaw?: string;
  priceU?: number;
  anchor?: Record<string, unknown> | null;
}

/** A term the buyer reads on Review, with the label it is read under. */
const SIGNED_TERMS: ReadonlyArray<readonly [key: string, label: string]> = [
  ['deliverables', 'what it delivers'],
  ['quality_standards', 'its quality standards'],
  ['success_criteria', 'its success criteria'],
];

function termsOf(quote: ComparableQuote): Record<string, unknown> {
  const anchor = quote.anchor;
  if (!anchor || typeof anchor !== 'object') return {};
  const terms = anchor.terms;
  return terms && typeof terms === 'object' && !Array.isArray(terms) ? (terms as Record<string, unknown>) : {};
}

/** The token the signed content names, or null when it names none. */
function currencyOf(quote: ComparableQuote): string | null {
  const anchor = quote.anchor;
  if (!anchor || typeof anchor !== 'object') return null;
  const currency = anchor.currency;
  return typeof currency === 'string' && currency.trim() ? currency.trim().toLowerCase() : null;
}

/** The price as a buyer read it, for the sentence. */
function shown(quote: ComparableQuote): string {
  return quote.priceU !== undefined ? `${quote.priceU} $U` : `${quote.priceRaw ?? 'an unstated amount'}`;
}

/* Order-insensitive for arrays of criteria; otherwise exact. */
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): string =>
    Array.isArray(v)
      ? JSON.stringify([...v].map((x) => String(x).trim()).sort())
      : v === undefined || v === null
        ? ''
        : String(v).trim();
  return norm(a) === norm(b);
}

export interface QuoteChange {
  /** 'price' when the number or token moved, 'terms' when the work did. */
  kind: 'price' | 'terms';
  /** One clause naming what moved, for the sentence shown to the buyer. */
  what: string;
}

/**
 * What a buyer would be paying for that they did not review, or null when
 * the replacement commits to the same work at the same price.
 */
export function materialQuoteChange(reviewed: ComparableQuote, replacement: ComparableQuote): QuoteChange | null {
  if (reviewed.priceRaw !== replacement.priceRaw) {
    return { kind: 'price', what: `its new price is ${shown(replacement)}, not the ${shown(reviewed)} you reviewed` };
  }
  /*
   * Only when both name one. An anchor without a currency is the seller
   * saying nothing, which is not the same as saying something different,
   * and stopping a hire over it would block every quote that omits it.
   */
  const before = currencyOf(reviewed);
  const after = currencyOf(replacement);
  if (before && after && before !== after) {
    return { kind: 'price', what: 'it now wants paying in a different token' };
  }

  const beforeTerms = termsOf(reviewed);
  const afterTerms = termsOf(replacement);
  const moved = SIGNED_TERMS.filter(([key]) => !same(beforeTerms[key], afterTerms[key])).map(([, label]) => label);
  if (moved.length === 0) return null;

  const list = moved.length === 1 ? moved[0] : `${moved.slice(0, -1).join(', ')} and ${moved[moved.length - 1]}`;
  return { kind: 'terms', what: `the price is the same but ${list} changed` };
}
