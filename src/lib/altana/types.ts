import type { Address, Hex } from 'viem';

/** Mirrors the SDK's permission schema, re-declared so UI code needs no SDK import. */
export interface CallPermission {
  to: Address;
  signature: string;
}

export interface SpendPermission {
  limit: bigint;
  period: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  token?: Address;
}

export interface SessionPermissions {
  calls?: readonly CallPermission[];
  spend?: readonly SpendPermission[];
}

/** A session Pokter granted, as persisted and displayed. */
export interface GrantedSession {
  id: string;
  agentChainId: number;
  agentTokenId: string;
  agentName: string;
  walletAddress: Address;
  publicKey: Hex;
  chainId: number;
  /** Whether this ran against testnet — surfaced in the UI, never blurred. */
  isTestnet: boolean;
  spendCapWei: string;
  period: string;
  expiresAt: string;
  grantedAt: string;
  grantTxHash: Hex | null;
  revokedAt: string | null;
  revokeTxHash: Hex | null;
}
