import { getAddress } from 'viem';

import { formatQuotedRaw } from '@/lib/erc8183/pricing';
import { formatAmount, paymentTokenAt, tokenName, type PaymentToken } from '@/lib/network/tokens';

/**
 * Which currencies to offer a buyer for one agent, from what Pokter has seen
 * that agent do, rather than every token Pokter can fund.
 *
 * The hire page used to list every enabled token for every agent, as if each
 * agent accepted them all, and its first option read "$U" while it meant "no
 * preference". The records Pokter actually keeps are the agent's latest
 * signed quote (one per agent; each new quote replaces the last) and the
 * jobs funded through Pokter, each with its chain and token. Both are
 * history, not a promise: every currency still needs a fresh signed quote,
 * and the agent may answer in another one.
 */

/** What Pokter has seen of one agent in one token, on one escrow chain. */
export interface CurrencyEvidence {
  /** Checksummed token contract on the escrow chain. */
  token: `0x${string}`;
  /** The agent's latest signed quote is in this token. */
  lastQuoted: boolean;
  /** Jobs funded through Pokter in this token, on this chain. */
  fundedJobs: number;
}

/**
 * The evidence for one agent on one escrow chain.
 *
 * Scoped to that chain and to each token contract. A testnet quote or job is
 * never evidence on mainnet, and the other way round; a token is matched by
 * its address, never by its symbol.
 */
export function currencyEvidence(input: {
  escrowChainId: number;
  /** The agent's latest signed quote, with the chain its currency belongs to. */
  quote: { currency: string; settlementChainId: number | null } | null;
  /** The agent's jobs funded through Pokter, on any chain. */
  jobs: ReadonlyArray<{ chainId: number; paymentToken?: string | null }>;
}): CurrencyEvidence[] {
  const byToken = new Map<string, CurrencyEvidence>();
  const entry = (address: string): CurrencyEvidence | null => {
    let token: `0x${string}`;
    try {
      token = getAddress(address);
    } catch {
      return null;
    }
    const found = byToken.get(token) ?? { token, lastQuoted: false, fundedJobs: 0 };
    byToken.set(token, found);
    return found;
  };
  if (input.quote && input.quote.settlementChainId === input.escrowChainId) {
    const e = entry(input.quote.currency);
    if (e) e.lastQuoted = true;
  }
  for (const job of input.jobs) {
    if (job.chainId !== input.escrowChainId || !job.paymentToken) continue;
    const e = entry(job.paymentToken);
    if (e) e.fundedJobs += 1;
  }
  /* The latest quote first: it is the agent's provisional default. Then the most funded. */
  return [...byToken.values()].sort((a, b) => Number(b.lastQuoted) - Number(a.lastQuoted) || b.fundedJobs - a.fundedJobs);
}

/** One currency a buyer can ask for, with what Pokter has seen of the agent in it (null: nothing either way). */
export interface CurrencyChoice {
  token: PaymentToken;
  seen: string | null;
}

export interface CurrencyChoices {
  /** The currency of the agent's latest signed quote here, if any: its default until it signs a fresh one. */
  lastSigned: PaymentToken | null;
  /** Tokens offered here that Pokter has seen this agent quote or be funded in. */
  seen: CurrencyChoice[];
  /** Tokens offered here with no evidence either way, behind "Ask for another currency". */
  unknown: CurrencyChoice[];
}

/** What was seen, in words. History only: never "accepts". */
function seenWords(e: CurrencyEvidence): string {
  const parts = [
    ...(e.lastQuoted ? ['its last signed quote'] : []),
    ...(e.fundedJobs > 0 ? [`${e.fundedJobs} job${e.fundedJobs === 1 ? '' : 's'} funded through Pokter`] : []),
  ];
  return parts.join('; ');
}

export function currencyChoices(chainId: number, offered: readonly PaymentToken[], evidence: readonly CurrencyEvidence[]): CurrencyChoices {
  const known = new Map(evidence.map((e) => [e.token.toLowerCase(), e]));
  const latest = evidence.find((e) => e.lastQuoted);
  const seen: CurrencyChoice[] = [];
  const unknown: CurrencyChoice[] = [];
  for (const token of offered) {
    const e = known.get(token.address.toLowerCase());
    (e ? seen : unknown).push({ token, seen: e ? seenWords(e) : null });
  }
  /* In the evidence's order, so the latest quote's currency leads. */
  seen.sort((a, b) => evidence.findIndex((e) => e.token.toLowerCase() === a.token.address.toLowerCase()) - evidence.findIndex((e) => e.token.toLowerCase() === b.token.address.toLowerCase()));
  return { lastSigned: latest ? paymentTokenAt(chainId, latest.token) : null, seen, unknown };
}

/**
 * The buyer asked for one currency and the agent signed in another.
 *
 * Null when nothing was asked (the agent's default) or the agent signed in
 * what was asked. Never a conversion: the quoted amount is shown in its own
 * money, exactly as signed, and that is what would be funded.
 */
export function currencyMismatch(
  chainId: number,
  requested: string | null,
  quote: { currency: string; amountRaw: string } | null,
): { requested: string; quoted: string } | null {
  if (!requested || !quote) return null;
  if (requested.toLowerCase() === quote.currency.toLowerCase()) return null;
  const asked = paymentTokenAt(chainId, requested);
  const signed = paymentTokenAt(chainId, quote.currency);
  const f = signed ? formatAmount(chainId, signed.address, quote.amountRaw) : null;
  return {
    requested: asked ? tokenName(asked) : requested,
    quoted: f && signed ? `${f.amount} ${tokenName(signed)}` : formatQuotedRaw(quote.currency, quote.amountRaw),
  };
}
