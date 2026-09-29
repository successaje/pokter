import type { SessionPermissions } from './types';
import {
  CATEGORY_INTEGRATIONS,
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
  /** Integrations a future safe adapter would need; none are granted today. */
  requiredIntegrations: KnownContract[];
  denied: string[];
  /** True when the agent needs no write authority whatsoever. */
  readOnly: boolean;
  /** Why Pokter refuses to create a delegated session for this category. */
  delegationBlockedReason: string;
}

export function summarise(request: PermissionRequest): PermissionSummary {
  const requiredIntegrations = CATEGORY_INTEGRATIONS[request.category] ?? [];

  return {
    requiredIntegrations,
    denied: DENIED_CAPABILITIES,
    readOnly: requiredIntegrations.length === 0,
    delegationBlockedReason:
      requiredIntegrations.length === 0
        ? 'This task is read-only, so Pokter creates no wallet authority for it.'
        : 'Pokter creates no delegated session until recipient, asset, position and amount constraints are all enforced on-chain.',
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
  // Keep the input in the API so every caller must still name the intended
  // category and bounds; none of those values may weaken the global pause.
  void request;
  /*
   * This is deliberately unconditional, including for read-only categories.
   * A read-only task needs no session, and creating a key with an empty call
   * list would add lifecycle and recovery risk without granting useful power.
   *
   * A target + selector is not enough for financial delegation. The next safe
   * implementation must constrain recipient, assets, position IDs and amounts
   * inside calldata through an audited adapter or account validator.
   */
  throw new Error(
    'Delegated wallet sessions are disabled: recipient, asset, position and amount constraints are not yet enforced on-chain.',
  );
}

export function expiryTimestamp(request: PermissionRequest): number {
  return Math.floor(Date.now() / 1000) + request.expiryDays * 86_400;
}
