import { erc20Abi, getAddress, type Address, type Hex, type PublicClient } from 'viem';

import type { StepLanded } from './step-watch';

/*
 * What each hire step changes on chain, read with plain contract calls that
 * every endpoint answers (the chain's own dataseeds refuse log queries), so
 * a step the wallet sent without answering the page is still recognised
 * (see `step-watch`).
 */

/** The escrow's job record, read the same way on both chains. */
const JOB_STATE_ABI = [{ name: 'getJob', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
  { name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'hook', type: 'address' }, { name: 'submittedAt', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' }] }] }] as const;
const JOB_COUNTER_ABI = [{ name: 'jobCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const;
/**
 * `status` in the escrow's job record: OPEN 0, FUNDED 1, SUBMITTED 2,
 * COMPLETED 3, REJECTED 4, EXPIRED 5. Any of FUNDED to REJECTED shows the
 * job was funded: an agent can deliver seconds after the money lands.
 */
const JOB_FUNDED = 1;
const JOB_REJECTED = 4;
/** Jobs created after the prompt that are searched for this buyer's, at most: anyone else's in between are skipped. */
const CREATED_SEARCH = 25n;

export function stepEffects(read: Pick<PublicClient, 'readContract' | 'call'>, commerce: Address, account: Address) {
  const job = (jobId: bigint) => read.readContract({ address: commerce, abi: JOB_STATE_ABI, functionName: 'getJob', args: [jobId] });
  return {
    /** A job this buyer created for this provider with exactly this description, numbered from `from`. */
    created: (from: bigint, provider: Address, description: string) => async (): Promise<StepLanded | null> => {
      const counter = await read.readContract({ address: commerce, abi: JOB_COUNTER_ABI, functionName: 'jobCounter' });
      for (let id = from; id <= counter && id < from + CREATED_SEARCH; id += 1n) {
        const found = await job(id);
        if (getAddress(found.client) === account && getAddress(found.provider) === getAddress(provider) && found.description === description) return { jobId: id };
      }
      return null;
    },
    /*
     * Registration has no view: a dry run of it reverts once it is done. A
     * dry run can revert for other reasons, so a revert counts only if the
     * same dry run succeeded before the prompt (read here, when the step is
     * set up), and only once the buyer's nonce moved (`requireNonce`).
     * Without that baseline the chain is not consulted for this step.
     */
    registered: async (router: Address, data: Hex): Promise<() => Promise<StepLanded | null>> => {
      const reverts = () => read.call({ account, to: router, data }).then(() => false, (error: unknown) => (/revert/i.test(String((error as { message?: unknown })?.message ?? '')) ? true : null));
      const before = await reverts().catch(() => null);
      if (before !== false) return async () => null;
      return async () => ((await reverts()) === true ? {} : null);
    },
    budgeted: (jobId: bigint, budget: bigint) => async (): Promise<StepLanded | null> => ((await job(jobId)).budget === budget ? {} : null),
    approved: (token: Address, amount: bigint) => async (): Promise<StepLanded | null> =>
      (await read.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, commerce] })) === amount ? {} : null,
    funded: (jobId: bigint) => async (): Promise<StepLanded | null> => {
      const { status } = await job(jobId);
      return status >= JOB_FUNDED && status <= JOB_REJECTED ? {} : null;
    },
  };
}

