import { getAddress } from 'viem';

import type { EscrowChainId } from './escrow';

/**
 * Every token Pokter knows about, by chain and address.
 *
 * Two assumptions were spread through the code and both are false. The first
 * is that a chain has one payment token: `ESCROW_PAYMENT_TOKEN` is a
 * `Record<EscrowChainId, Address>`, and the escrow a hire runs on was derived
 * from the token, so two tokens on one chain made the network unknowable. The
 * second is that every token has eighteen decimals, written as a literal `18`
 * in nine places.
 *
 * The second assumption is already wrong on the chains Pokter uses today.
 * Testnet USDC (`0xEC1C60D6…FDE47`) has **six** decimals while mainnet USDC
 * has eighteen, so the same symbol on the two escrows is a factor of 10^12
 * apart. A literal `18` against testnet USDC would compute an amount a
 * trillion times too large, and nothing in the type system would notice.
 *
 * So a token is identified by the pair that actually identifies it — chain id
 * and contract address — and never by its symbol. Symbols are not unique
 * across chains, are chosen by whoever deployed the contract, and `symbol()`
 * returning "USDT" is a label rather than provenance.
 */
export interface PaymentToken {
  chainId: EscrowChainId;
  /** Checksummed. The identity, together with `chainId`. */
  address: `0x${string}`;
  /** For display only. Never used to look a token up or to infer a chain. */
  symbol: string;
  /** Read from the contract, not assumed. See `VERIFIED_AT`. */
  decimals: number;
  /** Whether the escrow on this chain accepts it, read from `isPaymentTokenSupported`. */
  escrowSupported: boolean;
  /**
   * Whether Pokter offers it for a hire today.
   *
   * Separate from `escrowSupported` on purpose: the escrow accepting a token
   * is a fact about the contract, and offering it is a decision about the
   * product. USDT is supported on both chains and offered on neither, because
   * the hire path still builds `createJob` and approves the default token —
   * see the note at the end of this file.
   */
  offered: boolean;
}

/**
 * When the decimals and support flags below were read from the chains.
 *
 * Recorded rather than fetched at request time. A decimals lookup is a
 * network call, and putting one on the hire path — or worse, on a page render
 * — buys nothing: a token's decimals are fixed at deployment, and the set of
 * tokens here changes when somebody edits this file. The block numbers make
 * the claim checkable instead of merely asserted.
 */
export const VERIFIED_AT = {
  56: 128973013,
  97: 138113102,
} as const satisfies Record<EscrowChainId, number>;

const TOKENS: readonly PaymentToken[] = [
  /* $U — United Stables, the token both escrows default to. The only token
     Pokter offers, and the denomination of every job that exists today. */
  { chainId: 56, address: getAddress('0xcE24439F2D9C6a2289F741120FE202248B666666'), symbol: 'U', decimals: 18, escrowSupported: true, offered: true },
  { chainId: 97, address: getAddress('0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565'), symbol: 'U', decimals: 18, escrowSupported: true, offered: true },

  /* USDT — supported by both escrows, and the only candidate that is, which
     makes it the one that can be exercised on testnet before mainnet. One
     agent in the catalogue already signs prices in BNB Chain USDT. */
  { chainId: 56, address: getAddress('0x55d398326f99059fF775485246999027B3197955'), symbol: 'USDT', decimals: 18, escrowSupported: true, offered: false },
  { chainId: 97, address: getAddress('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'), symbol: 'USDT', decimals: 18, escrowSupported: true, offered: false },

  /* USDC — supported on mainnet, *not* on testnet, and six decimals there
     against eighteen on mainnet. Both facts are reasons to leave it alone:
     it cannot be rehearsed on testnet, and it is the case that breaks a
     hardcoded 18. It is listed so the decimals are recorded where the code
     can see them rather than discovered by a wrong transfer. */
  { chainId: 56, address: getAddress('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'), symbol: 'USDC', decimals: 18, escrowSupported: true, offered: false },
  { chainId: 97, address: getAddress('0xEC1C60D64a06896Df296438c12edD14E974FDE47'), symbol: 'USDC', decimals: 6, escrowSupported: false, offered: false },

  /* USD1 is deliberately absent. `isPaymentTokenSupported` returns true for
     `0x8d0D000E…8B0d` on chain 56, but that address is corroborated only by a
     comment in the upstream deployment script and by the token's own
     `symbol()`, which is self-declared. There is no token at that address on
     testnet at all. An address worth moving money to needs a better source
     than a comment, so it is not written down here as though verified. */
];

const key = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;
const BY_KEY = new Map(TOKENS.map((t) => [key(t.chainId, t.address), t]));

/**
 * The token at this address on this chain, or null when Pokter has not
 * verified one there.
 *
 * Null means "unknown", and unknown must stay unknown. The temptation is to
 * return a default with eighteen decimals so a caller has something to work
 * with, and that is precisely how a six-decimal token becomes a transfer a
 * trillion times too large.
 */
export function paymentTokenAt(chainId: number, address: string): PaymentToken | null {
  try {
    return BY_KEY.get(key(chainId, getAddress(address))) ?? null;
  } catch {
    /* Not an address, so not a token. */
    return null;
  }
}

/**
 * The decimals for a token Pokter has verified, or null.
 *
 * Callers that hold an amount must not proceed on null — see
 * `requireDecimals`, which is the right call wherever the token is known to
 * be one of ours and a null would mean the code is wrong rather than the
 * input unusual.
 */
export function decimalsFor(chainId: number, address: string): number | null {
  return paymentTokenAt(chainId, address)?.decimals ?? null;
}

/** Thrown rather than guessed: an unknown token has no safe default scale. */
export class UnknownPaymentTokenError extends Error {
  constructor(chainId: number, address: string) {
    super(`No verified token at ${address} on chain ${chainId}; refusing to assume its decimals.`);
    this.name = 'UnknownPaymentTokenError';
  }
}

export function requireDecimals(chainId: number, address: string): number {
  const decimals = decimalsFor(chainId, address);
  if (decimals === null) throw new UnknownPaymentTokenError(chainId, address);
  return decimals;
}

/** The tokens Pokter offers for a hire on this chain. Today: $U, and only $U. */
export function offeredTokens(chainId: number): PaymentToken[] {
  return TOKENS.filter((t) => t.chainId === chainId && t.offered);
}

/** Every token recorded for a chain, offered or not, for tests and diagnostics. */
export function knownTokens(chainId: number): PaymentToken[] {
  return TOKENS.filter((t) => t.chainId === chainId);
}

/**
 * What still stands between this file and a USDT hire.
 *
 * The escrow is ready: both deployments carry `createJobWithToken`,
 * `setPaymentTokenSupported` and `jobPaymentToken`, and both already report
 * USDT as supported. Nothing on chain needs deploying or upgrading.
 *
 * What is not ready is the call Pokter sends. `buildHireCalls` in
 * `@altananetwork/sdk@0.9` encodes `createJob` — the five-argument form with
 * no token — and approves `addresses.paymentToken`, so every hire funds in
 * the deployment's default whatever a quote says. Offering USDT means either
 * the SDK gaining `createJobWithToken` or Pokter encoding that batch itself,
 * and it means a buyer-facing choice of token, a re-quote when the choice
 * changes, and balances read per token. None of that is in this change.
 */
export const USDT_HIRE_BLOCKERS = [
  'SDK buildHireCalls encodes createJob, not createJobWithToken',
  'SDK buildHireCalls approves addresses.paymentToken, not the chosen token',
  'no buyer-facing token choice, and no re-quote when it changes',
  'balances, approvals and funding are read for one token only',
] as const;

/**
 * An amount in the token it is actually in.
 *
 * The `$U` label was written as a literal beside `formatUnits(raw, 18)` in
 * four places, two of which had the quote's currency available and did not
 * use it — `termsOf` in the MCP route takes `currency` as a parameter and
 * ignores it. One agent in the catalogue signs prices in BNB Chain USDT, so
 * that is a real price reported in the wrong money, not a hypothetical one.
 *
 * Returns null rather than a best effort when the token is not one Pokter has
 * verified. A caller that cannot name the money must say so: printing a
 * number with the wrong symbol is worse than printing no symbol, and printing
 * it with the wrong scale is worse again.
 */
export function formatAmount(
  chainId: number,
  currency: string | null | undefined,
  raw: string | bigint,
): { amount: string; symbol: string; label: string } | null {
  if (!currency) return null;
  const token = paymentTokenAt(chainId, currency);
  if (token === null) return null;
  let value: bigint;
  try {
    value = typeof raw === 'bigint' ? raw : BigInt(raw);
  } catch {
    return null;
  }
  const amount = formatUnitsLocal(value, token.decimals);
  const symbol = token.symbol === 'U' ? '$U' : token.symbol;
  return { amount, symbol, label: `${amount} ${symbol}` };
}

/**
 * The chain a quoted price settles on, from its currency's address.
 *
 * Not the agent's registration chain. Most of the catalogue is registered
 * on one network and paid on another, so formatting a quote against the
 * registration chain looked its currency up in the wrong registry: a
 * testnet-registered agent quoting mainnet $U printed "(unverified
 * token)" for a real price. An address is a token on one chain only in
 * this registry; if that ever stopped being true this returns null rather
 * than pick one.
 */
export function settlementChainOf(currency: string | null | undefined): number | null {
  if (!currency) return null;
  let address: string;
  try {
    address = getAddress(currency);
  } catch {
    return null;
  }
  const chains = [...new Set(TOKENS.filter((t) => t.address === address).map((t) => t.chainId))];
  return chains.length === 1 ? chains[0] : null;
}

/** A quoted price in words, read on the chain its currency belongs to (`settlementChainOf`), or null for a token Pokter has not verified. */
export function formatQuoted(currency: string | null | undefined, raw: string | bigint): { amount: string; symbol: string; label: string; chainId: number } | null {
  const chainId = settlementChainOf(currency);
  if (chainId === null) return null;
  const formatted = formatAmount(chainId, currency, raw);
  return formatted ? { ...formatted, chainId } : null;
}

/*
 * Integer-only, so an amount never passes through a float.
 *
 * `formatUnits` from viem does the same thing and is what the call sites used
 * before; this keeps the decimal handling beside the decimals themselves and
 * avoids the import cycle that pulling viem's formatter through this module
 * would create for the browser bundle.
 */
function formatUnitsLocal(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals === 0 ? '' : digits.slice(digits.length - decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/**
 * The decimals shared by every token Pokter offers, or a throw.
 *
 * For the one place that sums amounts from several jobs without knowing which
 * token each is in. Adding raw integers is only meaningful when they share a
 * scale, and today they do: both escrows settle in an eighteen-decimal $U.
 *
 * This exists so that stops being an assumption. The moment a token with a
 * different scale is offered, the sum becomes nonsense and this throws rather
 * than returning a number that looks plausible — which is the real danger,
 * since a six-decimal amount added to eighteen-decimal amounts does not look
 * wrong, it looks small.
 *
 * It does not make the sum correct. Mainnet $U and testnet $U share a scale
 * and are still different tokens, one real money and one not, so a total
 * across both chains is mixing money whatever this returns. Scoping that is a
 * change to a published shape and is listed as a blocker, not done here.
 */
export function uniformOfferedDecimals(): number {
  const offered = TOKENS.filter((t) => t.offered);
  const scales = [...new Set(offered.map((t) => t.decimals))];
  if (scales.length !== 1) {
    throw new Error(
      `Offered tokens no longer share a decimal scale (${scales.join(', ')}); amounts from different jobs cannot be summed.`,
    );
  }
  return scales[0];
}
