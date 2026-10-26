export interface CommissionAuthority {
  paymentToken: string;
  /** How the token is named to the buyer: "$U", or "USDT" for a USDT hire. */
  tokenSymbol: string;
  escrowContract: string;
  /** The amount, in whole units of `paymentToken` (the field predates other tokens). */
  budgetU: number;
  deliveryWindowHours: number;
  walletAuthority: 'none';
  approvalScope: 'exact-budget';
  canRevokeUnusedApproval: true;
  prohibited: string[];
}

/** The authority created by Pokter's current one-job ERC-8183 hire path. */
export function commissionAuthority(input: {
  paymentToken: string;
  tokenSymbol?: string;
  escrowContract: string;
  budgetU: number;
  deliveryWindowHours?: number;
}): CommissionAuthority {
  if (!Number.isFinite(input.budgetU) || input.budgetU <= 0) {
    throw new Error('A positive finite commission budget is required.');
  }
  return {
    paymentToken: input.paymentToken,
    tokenSymbol: input.tokenSymbol ?? '$U',
    escrowContract: input.escrowContract,
    budgetU: input.budgetU,
    deliveryWindowHours: input.deliveryWindowHours ?? 24,
    walletAuthority: 'none',
    approvalScope: 'exact-budget',
    canRevokeUnusedApproval: true,
    prohibited: [
      'Spend more than this commission budget',
      'Call other contracts from your wallet',
      'Keep a session key or standing wallet permission',
      'Release escrow before the review window after delivery has closed',
    ],
  };
}

