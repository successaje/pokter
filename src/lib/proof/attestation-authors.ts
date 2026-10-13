import 'server-only';

import { getAddress, isHash, type Address } from 'viem';

import { isTeamWallet } from '@/lib/alerts/team-wallets';
import { registryClient } from '@/lib/registry/onchain';
import type { ScanFeedback } from '@/lib/scan/types';

/**
 * Which on-chain attestations about an agent came from somebody else.
 *
 * The reputation registry already refuses an agent's owner: calling
 * `giveFeedback` as the owner of 97/2599 reverts with "Self-feedback not
 * allowed", while the same call from an unrelated address is accepted.
 * So a feedback row is never the owner praising themselves, and counting
 * rows was nearly right.
 *
 * Nearly. Pokter runs wallets that are not any agent's owner, and one of
 * them hiring a Pokter-operated agent and reviewing it would write a row
 * that passes the count and is not independent of anybody. The diagnostic
 * would then report an independent attestation while the verdict stayed
 * capped — Pokter telling a builder something its own engine disagrees
 * with, about the one measure it asks to be judged on.
 *
 * The indexer does not say who wrote a row, so the author is read from
 * the transaction that wrote it. One `eth_getTransactionByHash` per row,
 * which is affordable where this is used: one agent, at most a page of
 * feedback.
 */

export interface AttestationAuthors {
  /** Rows the indexer knows about. */
  total: number;
  /** Rows written by a wallet that is neither the owner nor Pokter's. */
  independent: number;
  /**
   * Rows written by a Pokter wallet, or — though the registry says this
   * cannot happen — by the agent's own owner. Disclosed, never counted
   * as independent.
   */
  related: number;
  /**
   * Rows whose author could not be read.
   *
   * Kept apart from both counts rather than assumed either way: an RPC
   * that did not answer is not evidence of independence, and treating it
   * as related would invent a disclosure that is not true.
   */
  undetermined: number;
}

export type AttestationIndependence = 'independent' | 'related' | 'undetermined';
export interface ResolvedAttestationAuthor {
  address: Address | null;
  independence: AttestationIndependence;
}

const authorCache = new Map<string, Address>();
const AUTHOR_CACHE_LIMIT = 2_000;

async function authorOf(
  chainId: number,
  transactionHash: string | null,
): Promise<Address | null> {
  if (!transactionHash || !isHash(transactionHash)) return null;
  const cacheKey = `${chainId}:${transactionHash.toLowerCase()}`;
  const cached = authorCache.get(cacheKey);
  if (cached) return cached;

  const client = registryClient(chainId);
  if (!client) return null;
  try {
    const transaction = await client.getTransaction({ hash: transactionHash });
    const author = getAddress(transaction.from);
    if (authorCache.size >= AUTHOR_CACHE_LIMIT) authorCache.clear();
    authorCache.set(cacheKey, author);
    return author;
  } catch {
    return null;
  }
}

export async function attestationAuthors(
  chainId: number,
  owner: string | null,
  rows: readonly ScanFeedback[],
): Promise<AttestationAuthors> {
  const resolved = await resolveAttestationAuthors(chainId, owner, rows);
  const summary: AttestationAuthors = { total: rows.length, independent: 0, related: 0, undetermined: 0 };
  for (const row of rows) summary[resolved.get(row.id)?.independence ?? 'undetermined'] += 1;
  return summary;
}

/** Resolve every receipt to the wallet that actually submitted its transaction. */
export async function resolveAttestationAuthors(
  chainId: number,
  owner: string | null,
  rows: readonly ScanFeedback[],
): Promise<Map<string, ResolvedAttestationAuthor>> {
  let ownerAddress: Address | null = null;
  try {
    ownerAddress = owner ? getAddress(owner) : null;
  } catch {
    ownerAddress = null;
  }

  const authors = await Promise.all(rows.map((row) => authorOf(chainId, row.transaction_hash)));
  return new Map(rows.map((row, index) => {
    const address = authors[index];
    const independence: AttestationIndependence = !address
      ? 'undetermined'
      : isTeamWallet(address) || (ownerAddress && address === ownerAddress)
        ? 'related'
        : 'independent';
    return [row.id, { address, independence }];
  }));
}
