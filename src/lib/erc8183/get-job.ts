import type { Erc8183Job, JobStatusName } from '@altananetwork/sdk';
import type { Address, PublicClient } from 'viem';

/**
 * A job read from the escrow, shared by the server's reader and the
 * browser's. Each chooses its own nodes (`job-read.ts`,
 * `job-read-browser.ts`) and asks the same question here, so neither answer
 * can drift from the SDK's `getErc8183Job`, which both replace.
 *
 * Nothing here is server-only or imports an SDK value, so the browser can
 * bundle it and a test can load it.
 */

export const GET_JOB_ABI = [{ name: 'getJob', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
  { name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'hook', type: 'address' }, { name: 'submittedAt', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' }] }] }] as const;

/** The kernel's statuses in order: the SDK's `JOB_STATUS`, which a test holds this to. */
export const JOB_STATUS_NAMES = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const;

export async function readErc8183Job(client: Pick<PublicClient, 'readContract'>, commerce: Address, jobId: bigint): Promise<Erc8183Job> {
  const job = await client.readContract({ address: commerce, abi: GET_JOB_ABI, functionName: 'getJob', args: [jobId] });
  /* As the SDK does: a status the kernel adds later reads UNKNOWN rather than throwing. */
  return { ...job, statusName: (JOB_STATUS_NAMES[job.status] ?? 'UNKNOWN') as JobStatusName };
}
