import { parseUnits } from 'viem';

import { nonDefaultHireToken } from '@/lib/erc8183/hire-token';
import { pathFundsToken, type HirePath } from '@/lib/network/hire-paths';
import { defaultHireToken, formatAmount, tokenName, type HireTokenSet, type PaymentToken } from '@/lib/network/tokens';
import { amountWithinLimits } from './budget-limits';

/**
 * What a hire will fund, in which money, through which wallet path — decided
 * once, before any wallet is asked, from the signed quote alone.
 *
 * The hire hook, the payment screen and the success screen all read this, so
 * the amount a buyer is shown is the amount the transaction carries, in the
 * token it carries it in. A `$U` hire is planned exactly as before: the
 * budget, at eighteen decimals, by any wallet. Any other token is planned as
 * exactly the signed amount, by a path that funds it, and refused by name
 * otherwise — never funded in `$U` instead.
 */
export type CommissionPlan =
  | {
      ok: true;
      /** Null for `$U`, the escrow default. */
      token: PaymentToken | null;
      symbol: string;
      decimals: number;
      amountRaw: bigint;
      /** The amount in words, with its symbol. */
      amountLabel: string;
      /** Whether the amount is fixed by the signature (any non-`$U` token) rather than a budget. */
      signedAmount: boolean;
      path: HirePath;
      /** Whether this hire may be sent as one atomic batch. */
      atomicAllowed: boolean;
    }
  | { ok: false; code: 'token-not-offered' | 'needs-signed-quote' | 'wallet-cannot-fund-token' | 'above-limit' | 'below-limit'; message: string; token: PaymentToken | null };

export function planCommission(input: {
  escrowChainId: number;
  walletMode: 'external' | 'passkey';
  /** The signed quote this hire funds, when there is one. */
  quote: { currency: string; amountRaw: string } | null;
  budgetU: number;
  agentName: string;
  tokens?: HireTokenSet;
}): CommissionPlan {
  let token: PaymentToken | null;
  try {
    token = nonDefaultHireToken(input.escrowChainId, input.quote?.currency, input.tokens);
  } catch (problem) {
    return { ok: false, code: 'token-not-offered', message: (problem as Error).message, token: null };
  }
  const path: HirePath = input.walletMode === 'passkey' ? 'passkey-wallet' : 'browser-wallet';
  if (token === null) {
    const dollarU = defaultHireToken(input.escrowChainId);
    const decimals = dollarU?.decimals ?? 18;
    const amountRaw = parseUnits(String(input.budgetU), decimals);
    return { ok: true, token: null, symbol: '$U', decimals, amountRaw, amountLabel: `${input.budgetU} $U`, signedAmount: false, path, atomicAllowed: true };
  }
  if (!input.quote) {
    return { ok: false, code: 'needs-signed-quote', message: `A hire in ${tokenName(token)} funds the agent's signed price, and there is none for this brief. Nothing was sent.`, token };
  }
  if (!pathFundsToken(path, token)) {
    return {
      ok: false,
      code: 'wallet-cannot-fund-token',
      message: `${input.agentName} priced this in ${tokenName(token)}, and the passkey wallet funds $U only. Nothing was sent. Connect a browser wallet to fund a ${tokenName(token)} hire.`,
      token,
    };
  }
  const amountRaw = BigInt(input.quote.amountRaw);
  /*
   * The same per-job range as a $U hire, in this token's own units. A signed
   * price above it is refused — not trimmed to fit, which would fund an
   * amount the agent never signed.
   */
  const limit = amountWithinLimits(token, amountRaw);
  if (!limit.ok) {
    return { ok: false, code: limit.side === 'above' ? 'above-limit' : 'below-limit', message: `${input.agentName} signed ${(() => { const f = formatAmount(token.chainId, token.address, amountRaw); return f ? `${f.amount} ${tokenName(token)}` : `${amountRaw} base units of ${tokenName(token)}`; })()}. ${limit.reason} Nothing was sent.`, token };
  }
  /* Named in full where it is chosen and confirmed: "Binance-Peg USDT", never a bare symbol that passes for the issuer's coin. */
  const name = tokenName(token);
  const formatted = formatAmount(token.chainId, token.address, amountRaw);
  return {
    ok: true,
    token,
    symbol: name,
    decimals: token.decimals,
    amountRaw,
    amountLabel: formatted ? `${formatted.amount} ${name}` : `${amountRaw} base units of ${name}`,
    signedAmount: true,
    path,
    /* The batch path is not exercised for other tokens yet; see `hire-paths`. */
    atomicAllowed: pathFundsToken('browser-wallet-batch', token),
  };
}
