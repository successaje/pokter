import { getAddress, type Address } from 'viem';

/**
 * What a buyer agreed to buy, fixed at the moment the seller signed it.
 *
 * The quote route picks the escrow from the fresh quote's currency and
 * checks its domain against that chain; the hire flow then dropped both and
 * funded on whatever chain the page was opened for. A page left on testnet
 * and a fresh mainnet quote could reach the wallet with terms the seller
 * never signed for, a job it would refuse. A quote signed for another
 * contract on the right chain was accepted outright.
 *
 * So the terms travel as one record and are compared, field by field, with
 * the transaction about to be signed, immediately before the wallet is
 * asked. Any difference stops the hire and asks for a fresh review; nothing
 * is quietly switched on the buyer's behalf.
 */
export interface PurchaseIntent {
  provider: Address;
  /** Exactly the text the seller signed. */
  task: string;
  amountRaw: string;
  currency: Address;
  chainId: number;
  /** The escrow contract the seller signed for, when its quote names one. */
  verifyingContract: Address | null;
  /** Seconds since the epoch, when the quote names an expiry. */
  expiresAt: number | null;
  negotiationHash: string;
}

/** Margin for the wallet steps still to come: approve, swap, sign. */
export const EXPIRY_MARGIN_SECONDS = 60;

const same = (a: string, b: string) => {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
};

export type IntentCheck = { ok: true } | { ok: false; reason: string };

export function checkPurchaseIntent(
  intent: PurchaseIntent,
  /*
   * `amountRaw` is the exact amount about to be funded. A token hire passes
   * it and must fund the signed amount to the unit: it is never derived from
   * a budget typed in another token, rounded, or converted. A $U hire leaves
   * it out and keeps its existing rule (a budget at or above the price).
   */
  funding: { provider: string; task: string; chainId: number; commerce: string; paymentToken: string; amountRaw?: string },
  nowMs: number = Date.now(),
): IntentCheck {
  if (funding.chainId !== intent.chainId) {
    return { ok: false, reason: `The agent's fresh price settles on chain ${intent.chainId}, and this hire was set to fund on chain ${funding.chainId}. Nothing was sent. Review the hire again on the network the price names.` };
  }
  if (!same(funding.paymentToken, intent.currency)) {
    return { ok: false, reason: 'The price is in a different token from the one this escrow holds. Nothing was sent; ask for a fresh quote.' };
  }
  if (funding.amountRaw !== undefined && funding.amountRaw !== intent.amountRaw) {
    return { ok: false, reason: `The hire would fund ${funding.amountRaw} base units, and the seller signed ${intent.amountRaw}. Nothing was sent; the signed amount is funded exactly or not at all.` };
  }
  if (intent.verifyingContract && !same(funding.commerce, intent.verifyingContract)) {
    return { ok: false, reason: `The seller signed this price for escrow ${intent.verifyingContract}, not the escrow this hire would fund (${funding.commerce}). The seller would refuse the job. Nothing was sent.` };
  }
  if (!same(funding.provider, intent.provider)) {
    return { ok: false, reason: 'The provider changed after the price was signed. Nothing was sent; review the hire again.' };
  }
  if (funding.task !== intent.task) {
    return { ok: false, reason: 'The brief changed after the price was signed, and the signature covers the exact words. Nothing was sent; get a fresh quote for the new brief.' };
  }
  if (intent.expiresAt !== null && intent.expiresAt * 1000 <= nowMs + EXPIRY_MARGIN_SECONDS * 1000) {
    return { ok: false, reason: 'The signed price expires before the hire could be funded. Nothing was sent; get a fresh quote and continue.' };
  }
  return { ok: true };
}
