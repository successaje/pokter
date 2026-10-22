import { bsc } from 'viem/chains';

/** The chain `read.ts` builds its client on. */
export const TRADING_CHAIN = bsc;

/**
 * The one chain the trading watch reads and verifies signatures on.
 *
 * Named once rather than written as `56` at each call site. The watch is
 * mainnet-only by construction — the watched tokens, the position manager
 * and the V3 factory in `./read` are all BNB Chain addresses — so this is
 * not a configuration knob, it is the assumption stated where it can be
 * found. Pokter has shipped a one-chain assumption twice now and paid for
 * it both times, and a bare `56` inside a signature check is exactly the
 * shape that hides: it reads as a detail of the call, not as a claim about
 * which chain the wallet lives on.
 *
 * Taken from the same chain object `./read` builds its client on, so the id
 * a signature is checked against and the chain it is read from cannot drift
 * apart.
 */
export const TRADING_CHAIN_ID = TRADING_CHAIN.id;
