import { fallback, http, type Transport } from 'viem';

import { rpcOrder, type ReadKind } from './rpc-order';

/**
 * Which BNB Chain node answers which kind of read.
 *
 * Public nodes answer the present: balances, `eth_call` at the head, a
 * transaction sent now. They refuse the past. PublicNode answers a receipt,
 * a log range more than about an hour old, or state at an old block with
 * "Archive requests require a personal token", even for a transaction a day
 * old; other public nodes refuse old log ranges or quietly return none.
 * NodeReal's key serves both, checked from production on 24 October 2026:
 * logs 1.5M blocks back, receipts, and balances 5M blocks back, on mainnet
 * and testnet.
 *
 * The key is a free tier (10M compute units a month), so it is spent only
 * where public nodes cannot answer. History reads ask NodeReal first,
 * because a public node can return an empty log range rather than an error
 * and nothing then falls through. Everything else asks public nodes first
 * and reaches NodeReal only when they refuse: viem's `fallback` moves on
 * for exactly those refusals and stops on a revert, which is an answer.
 *
 * The URL carries the key, and only server code ever has it: Next exposes
 * `NEXT_PUBLIC_` variables to the browser and no others, so in a browser
 * bundle `NODEREAL_API_KEY` is undefined and this is the public nodes alone.
 * Not marked `server-only` for that reason, because the registry reader
 * that uses it is shared with code that is not. Without the key both orders
 * are the public nodes alone, as before.
 */
export function nodeRealUrl(chainId: number): string | null {
  const key = process.env.NODEREAL_API_KEY?.trim();
  if (!key || (chainId !== 56 && chainId !== 97)) return null;
  return `https://bsc-${chainId === 56 ? 'mainnet' : 'testnet'}.nodereal.io/v1/${key}`;
}

/* One retry on a public node before moving on: its refusals do not change on a second ask. */
function transport(kind: ReadKind, chainId: number, publicUrls: readonly string[]): Transport {
  return fallback(rpcOrder(kind, publicUrls, nodeRealUrl(chainId)).map(({ url, public: isPublic }) => (isPublic ? http(url, { retryCount: 1 }) : http(url))));
}

/** The present: public nodes first, NodeReal when they refuse. */
export function readTransport(chainId: number, publicUrls: readonly string[]): Transport {
  return transport('present', chainId, publicUrls);
}

/** The past (old logs, receipts, state at an old block): NodeReal first, public nodes behind it. */
export function historyTransport(chainId: number, publicUrls: readonly string[]): Transport {
  return transport('history', chainId, publicUrls);
}
