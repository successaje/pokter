import {
  decodeEventLog,
  getAddress,
  type Address,
  type TransactionReceipt,
} from 'viem';

const JOB_CREATED_EVENT = {
  type: 'event', name: 'JobCreated',
  inputs: [
    { name: 'jobId', type: 'uint256', indexed: true },
    { name: 'client', type: 'address', indexed: true },
    { name: 'provider', type: 'address', indexed: true },
    { name: 'evaluator', type: 'address', indexed: false },
    { name: 'expiredAt', type: 'uint256', indexed: false },
    { name: 'hook', type: 'address', indexed: false },
  ],
} as const;

/** Decode the job id from this transaction, never from the mutable global counter. */
export function jobCreatedFromReceipt(
  receipt: Pick<TransactionReceipt, 'logs'>,
  commerce: Address,
  expectedClient: Address,
  expectedProvider: Address,
): bigint {
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(commerce)) continue;
    try {
      const decoded = decodeEventLog({
        abi: [JOB_CREATED_EVENT], data: log.data, topics: log.topics,
      });
      const args = decoded.args;
      if (
        getAddress(args.client) !== getAddress(expectedClient) ||
        getAddress(args.provider) !== getAddress(expectedProvider)
      ) throw new Error('JOB_IDENTITY_MISMATCH');
      return args.jobId;
    } catch (error) {
      if ((error as Error).message === 'JOB_IDENTITY_MISMATCH') throw error;
    }
  }
  throw new Error('JOB_CREATED_EVENT_MISSING');
}
