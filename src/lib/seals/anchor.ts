import 'server-only';

import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc, bscTestnet } from 'viem/chains';

import { altanaNetworkFor } from '@/lib/altana/client';
import type { ChainId } from '@/lib/scan/types';

/**
 * Put a seal's hash on a chain, so its time is not Pokter's to assert.
 *
 * The hash travels as the calldata of a zero-value transaction the
 * operator sends to itself. There is no contract because there is
 * nothing to compute: the only thing needed is that these 32 bytes
 * existed in a block, and a block has a timestamp nobody here controls.
 * A contract would add a deployment, an ABI and an upgrade path to
 * something a reader can already check with `eth_getTransactionByHash`.
 *
 * Sending to self is deliberate too. The transaction moves no value and
 * names no counterparty, so it cannot be mistaken for a payment by
 * anyone reading the operator wallet's history.
 */

/** Which chain seals are anchored on. Testnet unless told otherwise. */
export function sealChain(): ChainId {
  const configured = Number(process.env.SEAL_ANCHOR_CHAIN ?? 97);
  return configured === 56 ? 56 : 97;
}

export interface Anchored {
  chainId: number;
  transactionHash: Hex;
  blockNumber: number;
  blockTime: string;
}

/**
 * Anchor one hash and wait for it to confirm.
 *
 * The caller stores the seal text before this runs, so a transaction
 * that lands while the process dies is recoverable: the hash is already
 * on chain and the document it commits to is already saved, and a later
 * run can match them up. The reverse order would publish a commitment to
 * bytes nobody kept.
 */
export async function anchorSeal(hash: Hex): Promise<Anchored> {
  const key = process.env.ALTANA_ADMIN_KEY;
  if (!key || !key.startsWith('0x')) {
    throw new Error('ALTANA_ADMIN_KEY is not usable, so a seal cannot be anchored.');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error('A seal hash must be 32 bytes of hex.');
  }

  const chainId = sealChain();
  const chain = chainId === 56 ? bsc : bscTestnet;
  const transport = http(altanaNetworkFor(chainId).publicRpcUrl);
  const account = privateKeyToAccount(key as Hex);

  const wallet = createWalletClient({ account, chain, transport });
  const read = createPublicClient({ chain, transport });

  const transactionHash = await wallet.sendTransaction({
    to: account.address,
    value: 0n,
    data: hash,
  });
  const receipt = await read.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== 'success') {
    throw new Error(`The anchoring transaction ${transactionHash} reverted.`);
  }
  const block = await read.getBlock({ blockNumber: receipt.blockNumber });

  return {
    chainId,
    transactionHash,
    blockNumber: Number(receipt.blockNumber),
    blockTime: new Date(Number(block.timestamp) * 1000).toISOString(),
  };
}
