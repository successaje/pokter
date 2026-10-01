export interface CommissionAuthority {
  paymentToken: string;
  escrowContract: string;
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
  escrowContract: string;
  budgetU: number;
  deliveryWindowHours?: number;
}): CommissionAuthority {
  if (!Number.isFinite(input.budgetU) || input.budgetU <= 0) {
    throw new Error('A positive finite commission budget is required.');
  }
  return {
    paymentToken: input.paymentToken,
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
      'Release escrow before a submitted delivery reaches review',
    ],
  };
}

