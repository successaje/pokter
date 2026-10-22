/**
 * Which layer a hire failed in, so the buyer is told the right thing.
 *
 * The hire page matched any message containing "reject", "denied" or
 * "cancel" and said "You declined in the wallet. Nothing was sent and no
 * funds moved", so a seller refusing the brief read as the buyer's own
 * decision. And the quote reader turned every failure into "no quote",
 * which the route answered with one 502 and "it may be unreachable".
 *
 * Each failure now carries its layer, a code, and whether trying again can
 * help, and the copy follows the layer.
 */
export type FailureLayer = 'input' | 'seller' | 'protocol' | 'network' | 'wallet' | 'payment' | 'terms';

export type QuoteFailureCode =
  | 'no-endpoint'
  | 'no-price-skill'
  | 'seller-declined'
  | 'seller-not-ready'
  | 'auth-required'
  | 'rate-limited'
  | 'http-error'
  | 'timeout'
  | 'unreachable'
  | 'no-quote'
  | 'bad-signature'
  | 'terms-mismatch'
  | 'quote-expired'
  | 'payment-incompatible';

export interface QuoteFailure {
  code: QuoteFailureCode;
  layer: FailureLayer;
  retryable: boolean;
  /** The seller's own words, when it gave any. */
  sellerReason?: string;
  detail?: string;
  /** When this agent last signed a price for Pokter, if recently: a refusal now then reads as a passing block, not a closed door. */
  signedRecentlyAt?: string;
  /**
   * How long before the refusal that was, in minutes, worked out by
   * `withRecentQuote` on the same clock that judged it recent. The message
   * reads this rather than the clock again, so "40 minutes ago" is the age
   * the decision was made on, not whatever the clock says when the text is
   * built.
   */
  signedMinutesAgo?: number;
}

/** How recent a signed price has to be for a 401/403 to read as temporary. */
export const RECENT_QUOTE_MS = 24 * 3_600_000;

/**
 * A credential refusal from an agent that signed a price for Pokter within
 * the last day is not taken at its word.
 *
 * Mandate Guard-1 answered a buyer's brief with HTTP 403 on 21 October, and
 * the hire page said its endpoint requires credentials and it cannot be
 * hired through Pokter, while the sweep had a signed price from it forty
 * minutes earlier and a quote minutes later worked. A firewall or rate
 * limit in front of an open endpoint answers 403 too; the message has to
 * leave room for that and let the buyer try again.
 */
export function withRecentQuote(failure: QuoteFailure, lastQuotedAt: string | null | undefined, nowMs = Date.now()): QuoteFailure {
  if (failure.code !== 'auth-required' || !lastQuotedAt) return failure;
  const at = Date.parse(lastQuotedAt);
  if (!Number.isFinite(at) || nowMs - at > RECENT_QUOTE_MS) return failure;
  return { ...failure, retryable: true, signedRecentlyAt: lastQuotedAt, signedMinutesAgo: Math.max(1, Math.round((nowMs - at) / 60_000)) };
}

/** Every code, in the order the integration kit lists them. */
export const QUOTE_FAILURE_CODES: readonly QuoteFailureCode[] = [
  'no-endpoint', 'no-price-skill', 'auth-required', 'seller-declined', 'seller-not-ready',
  'no-quote', 'bad-signature', 'terms-mismatch', 'quote-expired', 'payment-incompatible',
  'rate-limited', 'timeout', 'http-error', 'unreachable',
];

const LAYER: Record<QuoteFailureCode, FailureLayer> = {
  'no-endpoint': 'seller',
  'no-price-skill': 'seller',
  'seller-declined': 'seller',
  'seller-not-ready': 'seller',
  'auth-required': 'seller',
  'rate-limited': 'network',
  'http-error': 'network',
  timeout: 'network',
  unreachable: 'network',
  'no-quote': 'protocol',
  'bad-signature': 'protocol',
  'terms-mismatch': 'protocol',
  // Signed and verified, but for terms no enabled escrow can fund.
  'quote-expired': 'protocol',
  'payment-incompatible': 'payment',
};

// An expired quote is asked for again; the next one may be fresh.
const RETRYABLE = new Set<QuoteFailureCode>(['rate-limited', 'http-error', 'timeout', 'unreachable', 'seller-not-ready', 'quote-expired']);

export function quoteFailure(code: QuoteFailureCode, extra: { sellerReason?: string; detail?: string } = {}): QuoteFailure {
  return { code, layer: LAYER[code], retryable: RETRYABLE.has(code), ...extra };
}

/** A thrown error from talking to the seller, by what it was. */
export function classifyQuoteError(error: unknown): QuoteFailure {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  const status = message.match(/answered (\d{3})/)?.[1];
  if (status === '401' || status === '403') return quoteFailure('auth-required', { detail: `HTTP ${status}` });
  if (status === '429') return quoteFailure('rate-limited', { detail: 'HTTP 429' });
  if (status) return quoteFailure('http-error', { detail: `HTTP ${status}` });
  /*
   * The card answered and names nowhere to send a brief: no A2A interface,
   * so `readAgentCard` refuses it. That is the agent's listing, not the
   * network, and asking again changes nothing. It fell through to
   * "could not be reached, try again shortly" for hwayongjin.agent
   * (56:300282), whose platform card says UNBOUND, offline, endpoint null.
   */
  if (/answered, but not with an agent card/i.test(message)) return quoteFailure('no-endpoint', { detail: 'card-without-interface' });
  if (/timeout|aborted/i.test(message)) return quoteFailure('timeout');
  if (/signature|signer|recover/i.test(message)) return quoteFailure('bad-signature', { detail: message.slice(0, 160) });
  return quoteFailure('unreachable', { detail: message.slice(0, 160) });
}

/** The buyer-facing words for a quote that did not come back, and the HTTP status that fits. */
export function describeQuoteFailure(failure: QuoteFailure, agentName: string): { message: string; status: number } {
  switch (failure.code) {
    case 'seller-declined':
      return { status: 422, message: `${agentName} declined this brief${failure.sellerReason ? `: “${failure.sellerReason}”` : '.'} Change the brief and ask again; nothing has been paid.` };
    case 'seller-not-ready':
      return { status: 409, message: `${agentName} accepted the request but has not produced a price yet. Try again shortly; nothing has been paid.` };
    case 'no-endpoint':
      if (failure.detail === 'card-without-interface') {
        return { status: 409, message: `${agentName}'s agent card answers but names no service to send a brief to, so it cannot quote a price. Its operator has listed it without connecting a running agent; nothing has been paid.` };
      }
      return { status: 409, message: `${agentName} publishes no agent card Pokter can reach, so it cannot quote a price.` };
    case 'no-price-skill':
      return { status: 409, message: `${agentName} does not offer a priced job (its card has no negotiate skill), so it cannot be hired through escrow.` };
    case 'auth-required':
      if (failure.signedRecentlyAt && failure.signedMinutesAgo !== undefined) {
        const ago = failure.signedMinutesAgo;
        return {
          status: 503,
          message: `${agentName} refused this request${failure.detail ? ` (${failure.detail})` : ''}, though it signed a price for Pokter ${ago < 90 ? `${ago} minutes` : `${Math.round(ago / 60)} hours`} ago, so this looks like a temporary block on its side. Try again in a minute; nothing has been paid.`,
        };
      }
      return { status: 409, message: `${agentName}'s endpoint requires credentials Pokter does not hold${failure.detail ? ` (${failure.detail})` : ''}. It cannot be hired through Pokter.` };
    case 'rate-limited':
      return { status: 503, message: `${agentName} is limiting requests right now. Try again in a minute; nothing has been paid.` };
    case 'http-error':
      return { status: 502, message: `${agentName} answered with an error${failure.detail ? ` (${failure.detail})` : ''}. Try again shortly; nothing has been paid.` };
    case 'timeout':
      return { status: 504, message: `${agentName} did not answer in time. Try again shortly; nothing has been paid.` };
    case 'unreachable':
      return { status: 502, message: `${agentName} could not be reached. Try again shortly; nothing has been paid.` };
    case 'bad-signature':
      return { status: 409, message: `${agentName} returned a price that is not signed by its registered wallet, so Pokter will not fund against it.` };
    case 'terms-mismatch':
      return { status: 409, message: `${agentName} signed terms that do not match this brief, so Pokter will not fund against them.` };
    case 'quote-expired':
      return { status: 409, message: `${agentName} signed a quote that had already expired when it arrived. Ask again; nothing has been paid.` };
    case 'payment-incompatible':
      return { status: 409, message: `${agentName} signed a quote no enabled escrow can pay${failure.detail ? `: ${failure.detail}` : '.'} Nothing has been paid.` };
    default:
      return { status: 502, message: `${agentName} did not return a signed price for this brief.` };
  }
}

/** A wallet's own "the user said no", as opposed to anything else that mentions rejection. */
export function isWalletRejection(error: unknown): boolean {
  const code = (error as { code?: unknown; cause?: { code?: unknown } })?.code ?? (error as { cause?: { code?: unknown } })?.cause?.code;
  if (code === 4001 || code === 'ACTION_REJECTED') return true;
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /UserRejectedRequestError|user rejected|user denied|rejected the request|NotAllowedError/i.test(message);
}

export class HireFailure extends Error {
  constructor(message: string, readonly layer: FailureLayer, readonly code?: string, readonly retryable = false) {
    super(message);
    this.name = 'HireFailure';
  }
}

/**
 * The title follows the layer the failure came from. Only a rejection the
 * wallet itself reported says the buyer declined: a seller refusing the
 * brief used to match "reject" here and read as the buyer's own decision.
 */
export function explainFailure(message: string, layer: FailureLayer | null = null): { title: string; body: string } {
  if (layer === 'wallet') return { title: 'You declined in the wallet', body: 'Nothing was sent and no funds moved. You can try again when ready.' };
  if (layer === 'input') return { title: 'The brief needs a change', body: message };
  if (layer === 'seller') return { title: 'The agent did not take this brief', body: message };
  if (layer === 'network') return { title: 'The agent could not be reached', body: message };
  if (layer === 'protocol') return { title: 'The agent’s quote stopped this hire', body: message };
  if (layer === 'payment') return { title: 'The agent’s price cannot be paid here', body: message };
  if (layer === 'terms') return { title: 'The agent’s price changed', body: message };
  if (/insufficient|balance|needs at least|You need/i.test(message)) return { title: 'Not enough in the wallet', body: message };
  if (/signed a price|signed quote|quote/i.test(message)) return { title: 'The agent’s quote stopped this hire', body: message };
  if (/network|chain|switch/i.test(message)) return { title: 'Wrong network', body: message };
  return { title: 'The hire did not complete', body: message };
}
