import { getAddress } from 'viem';

import { hireTokenAt, paymentTokenAt, type HireTokenSet, type PaymentToken } from './tokens';

/**
 * A buyer's preferred currency for a quote, as it travels to the agent.
 *
 * Outside the signed terms: it asks, it does not decide. The agent signs in
 * whichever currency it chooses, and the job is funded in exactly that one —
 * a preference is never applied to an existing signed price, converted or
 * relabelled. When the agent signs in something else, the buyer is told the
 * agent priced in X rather than Y, and chooses.
 */
export interface PreferredCurrency {
  chain_id: number;
  token: string;
  symbol: string;
  decimals: number;
}

/** A preference Pokter can fund: the token must be offered for hiring on that chain. Null otherwise. */
export function preferredCurrency(chainId: number, address: string | null | undefined, tokens?: HireTokenSet): PreferredCurrency | null {
  const token = address ? hireTokenAt(chainId, address, tokens) : null;
  return token ? { chain_id: token.chainId, token: token.address, symbol: token.symbol, decimals: token.decimals } : null;
}

/** Read a preference from an agent request's data part, as Pokter (or any buyer) sends it. */
export function readPreferredCurrency(data: unknown): { chainId: number; token: string } | null {
  const raw = (data as { preferred_currency?: unknown } | null)?.preferred_currency as { chain_id?: unknown; token?: unknown } | undefined;
  if (!raw || typeof raw.token !== 'string' || typeof raw.chain_id !== 'number') return null;
  try {
    return { chainId: raw.chain_id, token: getAddress(raw.token) };
  } catch {
    return null;
  }
}

/**
 * For Pokter's own agents: the token to price in on `chainId`. The buyer's
 * preference when it is a token offered there, otherwise the escrow default.
 * A preference for another chain, or for money Pokter does not fund, is
 * ignored rather than honoured into an unpayable price.
 */
export function quoteTokenFor(chainId: number, data: unknown, defaultToken: string, tokens?: HireTokenSet): PaymentToken {
  const asked = readPreferredCurrency(data);
  const preferred = asked && asked.chainId === chainId ? hireTokenAt(chainId, asked.token, tokens) : null;
  const fallback = paymentTokenAt(chainId, defaultToken);
  if (preferred) return preferred;
  if (!fallback) throw new Error(`No verified token at ${defaultToken} on chain ${chainId}.`);
  return fallback;
}

/**
 * Whether the agent signed in the currency the buyer asked for, as every
 * entry point reports it (the hire page, `get_quote`). Said plainly when it
 * did not: the price is the agent's, in its money, and is never converted
 * into the one asked for.
 */
export function preferenceReport(
  preferred: PreferredCurrency | null,
  signedCurrency: string,
  agentName: string,
): { asked: { token: string; symbol: string }; honoured: boolean; note: string | null } | null {
  if (!preferred) return null;
  const signed = paymentTokenAt(preferred.chain_id, signedCurrency);
  const signedSymbol = signed ? (signed.symbol === 'U' ? '$U' : signed.symbol) : signedCurrency;
  const askedSymbol = preferred.symbol === 'U' ? '$U' : preferred.symbol;
  const honoured = preferred.token.toLowerCase() === signedCurrency.toLowerCase();
  return {
    asked: { token: preferred.token, symbol: askedSymbol },
    honoured,
    note: honoured ? null : `You asked for ${askedSymbol}; ${agentName || 'the agent'} signed its price in ${signedSymbol}, so it may accept only certain currencies. The hire is funded in ${signedSymbol} at exactly that price, or you can choose another agent.`,
  };
}
