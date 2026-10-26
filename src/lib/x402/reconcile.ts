import { createPublicClient, getAddress, http, parseAbi, type Hex } from 'viem';
import { bsc } from 'viem/chains';

import { X402_ASSET, X402_MAX_VALIDITY_SECONDS } from './exact';
import type { X402Call } from './receipts';

/**
 * Whether a forwarded payment was taken, asked of the token, not the seller.
 *
 * A seller's reply cannot settle that: one can take the payment and then
 * answer an error. EIP-3009 makes the chain the authority instead. U marks
 * an authorization's nonce used the moment it moves the money, and refuses
 * it once `validBefore` has passed. So a payment is:
 *   - `settled` when the token says the nonce is used;
 *   - `expired-unused` when it is unused and the chain's clock is past
 *     `validBefore`: it can never be taken, so a new one cannot pay twice;
 *   - `may-still-settle` otherwise, until `validBefore`.
 * Only `expired-unused` lets the same wallet pay that seller again while the
 * earlier outcome is unresolved; nothing else is taken on the seller's word.
 */
export type Settlement = 'settled' | 'expired-unused' | 'may-still-settle';

export interface AuthorizationOnChain {
  used: boolean;
  /** The latest block's timestamp, in seconds: the clock `validBefore` is checked against. */
  chainTime: number;
}

export type ReadAuthorization = (payer: string, nonce: string) => Promise<AuthorizationOnChain>;

/*
 * Rows written before `valid_before` was stored: Pokter refused any
 * authorization valid for longer than this after it arrived, so this bounds it.
 */
const LEGACY_VALIDITY_SECONDS = X402_MAX_VALIDITY_SECONDS + 5;

export function latestValidBefore(call: Pick<X402Call, 'validBefore' | 'createdAt'>): number {
  return call.validBefore ?? Math.floor(Date.parse(call.createdAt) / 1000) + LEGACY_VALIDITY_SECONDS;
}

export function settlementOf(call: Pick<X402Call, 'validBefore' | 'createdAt'>, onChain: AuthorizationOnChain): Settlement {
  if (onChain.used) return 'settled';
  return onChain.chainTime >= latestValidBefore(call) ? 'expired-unused' : 'may-still-settle';
}

const ABI = parseAbi(['function authorizationState(address authorizer, bytes32 nonce) view returns (bool)']);
const RPC_URL = process.env.BSC_MAINNET_RPC_URL ?? 'https://bsc-rpc.publicnode.com';

export const readAuthorizationOnChain: ReadAuthorization = async (payer, nonce) => {
  const client = createPublicClient({ chain: bsc, transport: http(RPC_URL, { timeout: 8_000 }) });
  const [used, block] = await Promise.all([
    client.readContract({ address: X402_ASSET, abi: ABI, functionName: 'authorizationState', args: [getAddress(payer), nonce as Hex] }),
    client.getBlock({ blockTag: 'latest' }),
  ]);
  return { used, chainTime: Number(block.timestamp) };
};
