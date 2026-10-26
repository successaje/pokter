import { encodeFunctionData, erc20Abi, getAddress, type Address, type Hex } from 'viem';

import { hireTokenAt, isDefaultHireToken, type HireTokenSet } from '@/lib/network/tokens';

import { UnsupportedHireTokenError } from './hire-token';

/**
 * The hire batch for a job funded in a token other than the escrow default.
 *
 * `buildHireCalls` in `@altananetwork/sdk@0.9` encodes the five-argument
 * `createJob`, which binds the job to the deployment's default token, and
 * approves `addresses.paymentToken`. A USDT hire built that way would create a
 * $U job and approve $U: the seller signed USDT and would be paid in
 * something else. So this encodes the same five calls with the two that name
 * money changed:
 *
 *   createJobWithToken(provider, router, expiredAt, description, router, token)
 *   registerJob(jobId, policy)                     — as the SDK
 *   setBudget(jobId, budget, 0x)                   — as the SDK
 *   approve(commerce, budget) on `token`           — the signed token
 *   fund(jobId, budget, 0x)                        — as the SDK
 *
 * The router is evaluator and hook, as on every Pokter job: without a hook,
 * `createJobWithToken` reverts `HookRequired()`. The dispute policy holds no
 * token of its own, so disputes and refunds settle in the job's token.
 *
 * A $U hire never comes here. Callers keep using the SDK for it, so the path
 * that funds every job today is not touched by this file.
 */

export const COMMERCE_TOKEN_ABI = [
  {
    type: 'function', name: 'createJobWithToken', stateMutability: 'nonpayable',
    inputs: [
      { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' },
      { name: 'expiredAt', type: 'uint256' }, { name: 'description', type: 'string' },
      { name: 'hook', type: 'address' }, { name: 'paymentToken', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'setBudget', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'fund', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'jobPaymentToken', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'isPaymentTokenSupported', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'bool' }] },
] as const;

const ROUTER_ABI = [
  { type: 'function', name: 'registerJob', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [] },
] as const;

export interface TokenHireAddresses {
  commerce: Address;
  router: Address;
  policy: Address;
  paymentToken: Address;
}

export interface TokenHireCallsInput {
  chainId: number;
  addresses: TokenHireAddresses;
  jobId: bigint;
  provider: Address;
  description: string;
  budget: bigint;
  expiredAt: bigint;
  /** The token the seller signed. Must be an offered, non-default token on `chainId`. */
  token: Address;
  /** The tokens turned on, when the caller states them; otherwise `NEXT_PUBLIC_HIRE_TOKENS`. */
  tokens?: HireTokenSet;
}

export interface HireCall {
  to: Address;
  data: Hex;
  /** Never set: no hire call sends native value. Present so these and the SDK's calls share a shape. */
  value?: bigint;
}

export { nonDefaultHireToken, UnsupportedHireTokenError } from './hire-token';

export function buildTokenHireCalls(input: TokenHireCallsInput): HireCall[] {
  if (new TextEncoder().encode(input.description).length > 4096) {
    throw new Error('erc8183: description exceeds 4096 bytes (kernel limit — do not truncate signed quotes).');
  }
  const token = hireTokenAt(input.chainId, input.token, input.tokens);
  if (!token || isDefaultHireToken(token)) {
    throw new UnsupportedHireTokenError(`${input.token} is not an offered non-default token on chain ${input.chainId}; a $U hire is built by the SDK.`);
  }
  if (input.budget <= 0n) throw new Error('INVALID_BUDGET');
  const a = input.addresses;
  return [
    {
      to: a.commerce,
      data: encodeFunctionData({ abi: COMMERCE_TOKEN_ABI, functionName: 'createJobWithToken', args: [input.provider, a.router, input.expiredAt, input.description, a.router, token.address] }),
    },
    { to: a.router, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'registerJob', args: [input.jobId, a.policy] }) },
    { to: a.commerce, data: encodeFunctionData({ abi: COMMERCE_TOKEN_ABI, functionName: 'setBudget', args: [input.jobId, input.budget, '0x'] }) },
    { to: token.address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [a.commerce, input.budget] }) },
    { to: a.commerce, data: encodeFunctionData({ abi: COMMERCE_TOKEN_ABI, functionName: 'fund', args: [input.jobId, input.budget, '0x'] }) },
  ];
}

type Reader = { readContract: (args: { address: Address; abi: typeof COMMERCE_TOKEN_ABI; functionName: 'isPaymentTokenSupported' | 'jobPaymentToken'; args: readonly unknown[] }) => Promise<unknown> };

/**
 * Asked of the deployed escrow before anything is signed. The list in
 * `tokens.ts` records what was true when it was written; the contract's owner
 * can withdraw support since, and a hire must not find that out from a revert.
 * An unreadable answer is a refusal too.
 */
export async function assertEscrowSupportsToken(read: Reader, commerce: Address, token: Address): Promise<void> {
  let supported: unknown;
  try {
    supported = await read.readContract({ address: commerce, abi: COMMERCE_TOKEN_ABI, functionName: 'isPaymentTokenSupported', args: [token] });
  } catch {
    throw new UnsupportedHireTokenError('Pokter could not confirm that this escrow accepts the token the seller priced in. Nothing was sent; try again shortly.');
  }
  if (supported !== true) {
    throw new UnsupportedHireTokenError('This escrow no longer accepts the token the seller priced in. Nothing was sent.');
  }
}

/**
 * The token a job is bound to, from the escrow. Null when the read failed:
 * unknown stays unknown, and is never filled in with the default.
 */
export async function readJobPaymentToken(read: Reader, commerce: Address, jobId: bigint): Promise<Address | null> {
  try {
    const token = await read.readContract({ address: commerce, abi: COMMERCE_TOKEN_ABI, functionName: 'jobPaymentToken', args: [jobId] });
    return typeof token === 'string' ? getAddress(token) : null;
  } catch {
    return null;
  }
}

/**
 * After funding: whether the escrow bound the job to the signed token.
 *
 * The money has moved by now, so a read that fails is the RPC, not the job.
 * It is retried; still unread, the answer is `unread` and the hire is
 * recorded as funded with its token unknown (the sweep reads it later). It is
 * never a failed hire, because a failed hire invites a second payment. Only a
 * token that reads back as something else throws.
 */
export async function confirmJobToken(
  read: Reader,
  commerce: Address,
  jobId: bigint,
  token: Address,
  { attempts = 3, sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), delayMs = 1_500 }: { attempts?: number; sleep?: (ms: number) => Promise<void>; delayMs?: number } = {},
): Promise<'confirmed' | 'unread'> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(delayMs);
    const bound = await readJobPaymentToken(read, commerce, jobId);
    if (bound === null) continue;
    if (bound !== getAddress(token)) throw new Error('FUNDED_JOB_TOKEN_VERIFICATION_FAILED');
    return 'confirmed';
  }
  return 'unread';
}
