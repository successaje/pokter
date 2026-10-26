import 'server-only';

import { getAddress, type Address } from 'viem';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { historyClient } from '@/lib/erc8183/history-client';

const GET_JOB_ABI = [{ name: 'getJob', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
  { name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'hook', type: 'address' }, { name: 'submittedAt', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' }] }] }] as const;

const STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const;

/**
 * A job's status and committed deliverable read from the escrow itself,
 * not the index, which can lag a submission by a sweep. Null when the chain
 * did not answer: callers that act on it must then not act.
 */
export async function jobOnChain(chainId: number, jobId: string): Promise<{ status: (typeof STATUS)[number] | 'UNKNOWN'; deliverable: string; submittedAt: bigint } | null> {
  if ((chainId !== 56 && chainId !== 97) || !/^\d+$/.test(jobId)) return null;
  try {
    const job = await historyClient(chainId).readContract({ address: getAddress(correctedErc8183Addresses(chainId).commerce) as Address, abi: GET_JOB_ABI, functionName: 'getJob', args: [BigInt(jobId)] });
    return { status: STATUS[job.status] ?? 'UNKNOWN', deliverable: job.deliverable, submittedAt: job.submittedAt };
  } catch {
    return null;
  }
}

const JOB_TOKEN_ABI = [{ name: 'jobPaymentToken', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'address' }] }] as const;

/**
 * The token an escrow job is bound to, from `jobPaymentToken`. Null when the
 * chain did not answer: the caller records nothing, so the row stays unknown
 * and a later read can fill it. Never defaulted to $U.
 */
export async function jobPaymentTokenOnChain(chainId: number, jobId: string): Promise<Address | null> {
  if ((chainId !== 56 && chainId !== 97) || !/^\d+$/.test(jobId)) return null;
  try {
    const token = await historyClient(chainId).readContract({ address: getAddress(correctedErc8183Addresses(chainId).commerce) as Address, abi: JOB_TOKEN_ABI, functionName: 'jobPaymentToken', args: [BigInt(jobId)] });
    return getAddress(token);
  } catch {
    return null;
  }
}
