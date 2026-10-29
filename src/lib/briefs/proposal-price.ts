import { formatUnits } from 'viem';

import { amountToRaw, requestAmountLabel, withinBudget } from './model';
import { defaultHireToken, displaySymbol, requestToken, type PaymentToken } from '@/lib/network/tokens';

/**
 * A proposal's price is the one its agent signs for the request.
 *
 * The owner used to type it, and the hire then asked the agent for its own
 * signed price and refused one above the typed number, so an agent that
 * signs 1 USDT could propose 0.5 and be chosen into a hire that could never
 * be funded. Now the agent is asked for a signed quote for the request's
 * own brief, in the request's token, and that is the floor: never below it,
 * so a chosen proposal can always be funded. An owner who wants to offer
 * less has the agent sign less.
 *
 * Above it depends on the token. A $U hire funds the buyer's budget, which
 * may exceed the agent's signed price, so an owner may ask more than the
 * agent's standing price for a request worth more, and the hire funds what
 * was proposed. A hire in any other token funds exactly the amount the
 * agent signed (`checkPurchaseIntent`: "funded exactly or not at all"), so
 * a proposal in one carries the signed price; to ask more, the agent signs
 * more.
 *
 * Pure, so the proposal route, both proposal tools and the form apply the
 * same rule.
 */

/** How long a quote asked for a proposal may stand before the proposal is signed. Long enough to write the approach and sign; not a standing price. */
export const PROPOSAL_QUOTE_MAX_AGE_MS = 30 * 60_000;

/** The agent's signed price for one request, as Pokter received it. */
export interface ProposalQuote {
  briefId: string;
  agentChainId: number;
  agentTokenId: string;
  /** Base units of `currency`, exactly as signed. */
  priceRaw: string;
  /** Whole units of `currency`, written so that it converts back to `priceRaw` exactly. */
  priceU: number;
  currency: string;
  signer: string;
  negotiationHash: string;
  quotedAt: string;
  expiresAt: string | null;
}

/**
 * A signed amount as the number a proposal signs. Null when that number
 * cannot be written back to exactly the signed amount, which would make
 * the proposal's price a rounding of the agent's rather than the agent's.
 */
export function proposalPriceFrom(priceRaw: string, token: Pick<PaymentToken, 'decimals'>): number | null {
  let raw: bigint;
  try {
    raw = BigInt(priceRaw);
  } catch {
    return null;
  }
  if (raw <= BigInt(0)) return null;
  const priceU = Number(formatUnits(raw, token.decimals));
  return amountToRaw(priceU, token.decimals) === raw ? priceU : null;
}

/**
 * Whether a proposal in this token may be priced above the agent's signed
 * price: only in the chain's $U, the one token whose hire funds a budget
 * rather than exactly the signed amount.
 */
export function proposalPriceFlexible(chainId: number, paymentToken: string | null): boolean {
  const token = requestToken(chainId, paymentToken);
  const dollarU = defaultHireToken(chainId);
  return Boolean(token && dollarU && token.address.toLowerCase() === dollarU.address.toLowerCase());
}

/** Whether a quote is still young enough to price a proposal signed at `at`. */
export function proposalQuoteFresh(quote: Pick<ProposalQuote, 'quotedAt'>, at: number = Date.now()): boolean {
  const quotedAt = Date.parse(quote.quotedAt);
  return Number.isFinite(quotedAt) && at - quotedAt <= PROPOSAL_QUOTE_MAX_AGE_MS && quotedAt - at <= 60_000;
}

/**
 * Why a proposal's price is not the one its agent signed for this request,
 * or null when it is. `placedAt` is when the proposal was signed: the quote
 * has to have been asked for shortly before, not days ago.
 */
export function proposalPriceProblem(
  content: { priceRaw: string; paymentToken: string | null },
  quote: ProposalQuote | null,
  placedAt: string,
  labels: { price: string; signed: string | null },
  /** `proposalPriceFlexible` for the request: whether above the signed price is allowed. */
  { aboveAllowed = false }: { aboveAllowed?: boolean } = {},
): string | null {
  if (!quote) return 'Ask the agent for its signed price for this request first. A proposal can be no lower than the price its agent signs.';
  if (!proposalQuoteFresh(quote, Date.parse(placedAt))) {
    return `The agent's signed price was asked for more than ${PROPOSAL_QUOTE_MAX_AGE_MS / 60_000} minutes before this proposal was signed. Ask it again, then sign.`;
  }
  if (!content.paymentToken || content.paymentToken.toLowerCase() !== quote.currency.toLowerCase()) {
    return 'The agent signed its price in a different token from this proposal. A proposal is in its request’s token, and so is the price the agent signs for it.';
  }
  let offered: bigint;
  let signed: bigint;
  try {
    offered = BigInt(content.priceRaw);
    signed = BigInt(quote.priceRaw);
  } catch {
    return 'The proposal’s price could not be read.';
  }
  if (offered < signed) {
    return `This proposal says ${labels.price}, below the ${labels.signed ?? 'price'} the agent signed for this request. A proposal can’t undercut the agent’s own price: to go lower, have it sign less, then ask again.`;
  }
  if (offered > signed && !aboveAllowed) {
    return `This proposal says ${labels.price}, above the ${labels.signed ?? 'price'} the agent signed. In this token a hire funds exactly what the agent signs, so the proposal carries its signed price; to ask more, the agent has to sign more for this request.`;
  }
  return null;
}

/** Why a typed price cannot be proposed, or null; the same rule as the route, for the form and the tools. */
export function typedPriceProblem(
  typedRaw: bigint | null,
  quote: Pick<ProposalQuote, 'priceRaw'>,
  token: Pick<PaymentToken, 'symbol'>,
  signedLabel: string,
  aboveAllowed: boolean,
): string | null {
  if (typedRaw === null) return `Enter a price in ${displaySymbol(token)}.`;
  const signed = BigInt(quote.priceRaw);
  if (typedRaw < signed) return `No lower than ${signedLabel}, the price your agent signs for this request. To go lower, have it sign less, then ask again.`;
  if (typedRaw > signed && !aboveAllowed) return `In ${displaySymbol(token)} a hire funds exactly what your agent signs, so this proposal is at ${signedLabel}. To ask more, have it sign more.`;
  return null;
}

/** Whether a proposal costs more than its request's budget. Same token only; a price in another token is not compared. */
export function aboveBudget(
  price: { paymentToken: string | null; priceRaw: string },
  request: { chainId: number; paymentToken: string | null; budgetRaw: string },
): boolean {
  /* Resolved as the budget rule resolves them: no token on an older row is its chain's $U. */
  const asked = requestToken(request.chainId, request.paymentToken);
  const offered = requestToken(request.chainId, price.paymentToken);
  if (!asked || !offered || asked.address !== offered.address) return false;
  return !withinBudget(price, request);
}

/**
 * The amount a poster agrees to fund when choosing a proposal above their
 * budget, in the words the choice signs; null when it is within budget.
 * One function for the page and the route, so both build the same message.
 */
export function fundsAboveBudget(
  bid: { paymentToken: string | null; priceRaw: string; priceU: number },
  request: { chainId: number; paymentToken: string | null; budgetRaw: string },
): string | null {
  return aboveBudget(bid, request) ? requestAmountLabel({ chainId: request.chainId, paymentToken: bid.paymentToken }, bid.priceU) : null;
}
