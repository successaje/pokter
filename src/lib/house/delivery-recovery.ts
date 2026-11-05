import type { Hex } from 'viem';

/** Decide from chain state before a house agent performs work or sends another transaction. */
export function deliveryRecovery(input: {
  status: string;
  storedHash: Hex | null;
  chainHash: Hex;
  submittedTx: Hex | null;
}): 'already-delivered' | 'pending' | 'reuse-manifest' | 'create-manifest' | 'mismatch' | 'not-funded' {
  if (input.status === 'SUBMITTED' || input.status === 'COMPLETED') {
    return input.storedHash && input.storedHash.toLowerCase() === input.chainHash.toLowerCase() ? 'already-delivered' : 'mismatch';
  }
  if (input.status !== 'FUNDED') return 'not-funded';
  if (input.submittedTx) return 'pending';
  return input.storedHash ? 'reuse-manifest' : 'create-manifest';
}
