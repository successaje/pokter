import { parseEther, type Address } from 'viem';

import type { SessionPermissions } from './types';
import {
  CATEGORY_CONTRACTS,
  DENIED_CAPABILITIES,
  type KnownContract,
} from './contracts';

export type SpendPeriod = 'day' | 'week' | 'month';

/** The grant a user configures in the hire flow, before it becomes a session. */
export interface PermissionRequest {
  category: string;
  /** Spend ceiling in native BNB. */
  spendCapBnb: number;
  period: SpendPeriod;
  /** Days until the session expires on its own. */
  expiryDays: number;
}

/** The same grant, rendered for the §31 review screen. */
export interface PermissionSummary {
  allowed: KnownContract[];
  denied: string[];
  spendCap: string;
  period: SpendPeriod;
  expiresAt: Date;
  /** True when the agent needs no write authority whatsoever. */
  readOnly: boolean;
}

export function summarise(request: PermissionRequest): PermissionSummary {
  const allowed = CATEGORY_CONTRACTS[request.category] ?? [];

  return {
    allowed,
    denied: DENIED_CAPABILITIES,
    spendCap: `${request.spendCapBnb} BNB`,
    period: request.period,
    expiresAt: new Date(Date.now() + request.expiryDays * 86_400_000),
    readOnly: allowed.length === 0,
  };
}

/**
 * Translate the user's grant into the on-chain permission set.
 *
 * Every allowed method becomes its own `{ to, signature }` rule, so authority is
 * scoped to specific functions on specific contracts rather than to a contract
 * wholesale. A monitoring agent produces an empty call list — and an empty list
 * is a real constraint here, not a missing one, because the account contract
 * treats an unlisted target as a revert.
 */
export function toSessionPermissions(
  request: PermissionRequest,
): SessionPermissions {
  const contracts = CATEGORY_CONTRACTS[request.category] ?? [];

  const calls = contracts.flatMap((contract) =>
    contract.methods.map((signature) => ({
      to: contract.address as Address,
      signature,
    })),
  );

  return {
    calls,
    spend: [
      {
        limit: parseEther(String(request.spendCapBnb)),
        period: request.period,
      },
    ],
  };
}

export function expiryTimestamp(request: PermissionRequest): number {
  return Math.floor(Date.now() / 1000) + request.expiryDays * 86_400;
}
