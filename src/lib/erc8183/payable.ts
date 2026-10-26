import { getAddress } from 'viem';

import { chainLabel } from '@/lib/network/presentation';
import { displaySymbol, hireTokenAt, paymentTokenAt, settlementChainOf, type HireTokenSet } from '@/lib/network/tokens';

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

/**
 * Whether a quoted price is in money the escrow on `chainId` can be funded
 * with by Pokter: a token it offers there. $U always; another token only
 * when it is eligible and turned on. With none on this is
 * `quotePayableWith(currency, default)`.
 */
export function quotePayableOn(chainId: number, currency: string, tokens?: HireTokenSet): boolean {
  return hireTokenAt(chainId, currency, tokens) !== null;
}

/** BNB Chain mainnet $U, the token most sellers quote in. */
const MAINNET_U = '0xcE24439F2D9C6a2289F741120FE202248B666666';

/**
 * Why a signed price cannot be paid here, in words a buyer can act on:
 * what the price is in, what that means for a job funded here, and what to
 * do instead. Mainnet $U is named because it is nearly every case.
 *
 * Any other token is named too, from the registry by its own chain. "In a
 * token" told a buyer looking at a USDT price nothing they could act on;
 * the symbol and network do. A token Pokter has not verified is said to be
 * one, rather than given a symbol it may only claim.
 */
export function unpayablePriceNote(currency: string, escrowIsTestnet: boolean): string {
  let mainnetU = false;
  try {
    mainnetU = getAddress(currency) === getAddress(MAINNET_U);
  } catch {
    mainnetU = false;
  }
  const chainId = settlementChainOf(currency);
  const token = chainId === null ? null : paymentTokenAt(chainId, currency);
  const what = mainnetU
    ? 'in mainnet $U'
    : token && chainId !== null
      ? `in ${displaySymbol(token)} on ${chainLabel(chainId)}`
      : 'in a token Pokter has not verified';
  const where = escrowIsTestnet ? 'Pokter’s escrow currently runs on testnet' : 'Pokter’s escrow settles in a different token';
  return `This agent sets its price ${what}, and ${where}, so it would turn down a job funded here. You can still try it for free, or hire an agent that prices in this escrow’s token.`;
}
