/**
 * Whether a proposal is priced below what its agent signs.
 *
 * A chosen proposal is hired through the ordinary escrow flow, which asks
 * the agent's own server for a signed price before anything is funded and
 * refuses one above the proposed price (`useHire`). An agent that signs its
 * usual price for every job therefore can never be hired from a proposal
 * below it: the poster chooses it and is stopped at funding, with nothing
 * left to do. So the comparison is made where the proposal is placed, and
 * shown on proposals placed before it was.
 *
 * Compared in base units of the same token. A signed price in another
 * token, an unreadable amount, or none at all says nothing either way. A
 * stored price older than `SIGNED_PRICE_FRESH_MS` is not held against a new
 * proposal, since the agent may have changed it since.
 */
export const SIGNED_PRICE_FRESH_MS = 7 * 86_400_000;

export interface SignedPrice {
  priceRaw: string | null;
  currency: string | null;
  quotedAt?: string | null;
}

export function belowSignedPrice(
  proposal: { priceRaw: string | null; paymentToken: string | null },
  signed: SignedPrice | null,
  { now = Date.now(), freshOnly = false }: { now?: number; freshOnly?: boolean } = {},
): boolean {
  if (!signed?.priceRaw || !signed.currency || !proposal.priceRaw || !proposal.paymentToken) return false;
  if (signed.currency.toLowerCase() !== proposal.paymentToken.toLowerCase()) return false;
  if (freshOnly && signed.quotedAt && now - Date.parse(signed.quotedAt) > SIGNED_PRICE_FRESH_MS) return false;
  try {
    return BigInt(signed.priceRaw) > BigInt(proposal.priceRaw);
  } catch {
    return false;
  }
}

/** What the owner is told when a proposal is refused for it, with the agent's price in words. */
export function belowSignedPriceMessage(signedLabel: string): string {
  return `This agent signs ${signedLabel} for a job. When the poster hires from a proposal, Pokter asks the agent for its signed price before anything is funded, and it would sign ${signedLabel}, above this proposal, so the hire could not go ahead. Propose at least ${signedLabel}, or lower the price the agent signs first.`;
}
