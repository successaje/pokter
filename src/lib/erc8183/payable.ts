import { getAddress } from 'viem';

/**
 * Whether a quoted price is in money a given escrow can actually pay.
 *
 * The two ERC-8183 deployments settle in different tokens — chain 56's $U is
 * a different contract from chain 97's — and a seller quotes in whichever it
 * settles in. Of the thirteen agents in the catalogue that have ever returned
 * a signed price, ten quote in the mainnet token and one in real BNB Chain
 * USDT, so an escrow on 97 can pay none of them whatever else is true about
 * the agent.
 *
 * Takes the token rather than looking it up from the chain id, because the
 * lookup lives in the SDK and this is the part worth pinning in a test.
 */
export function quotePayableWith(
  currency: string,
  paymentToken: string,
): boolean {
  try {
    return getAddress(currency) === getAddress(paymentToken);
  } catch {
    /* An unreadable address is not a currency anything can pay. */
    return false;
  }
}
