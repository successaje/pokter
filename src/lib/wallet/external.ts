import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  http,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { WALLET_NETWORK } from '@/lib/wallet/passkey';

/**
 * Hiring from the wallet someone already has.
 *
 * The Altana SDK cannot do this and says so: injected wallets refuse the two
 * signatures its EIP-7702 flow needs — the delegation authorization, and raw
 * 32-byte relay digests. That second refusal is correct behaviour on the
 * wallet's part, not a gap. So this path skips Altana entirely and talks to
 * the ERC-8183 kernel directly.
 *
 * What is given up is the atomic batch, and that is not a small loss. The
 * five calls become five transactions, and every failure between them leaves
 * a state a person now owns. Everything below exists to make those states
 * survivable.
 */

const KERNEL_ABI = [
  {
    name: 'createJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'evaluator', type: 'address' },
      { name: 'expiredAt', type: 'uint256' },
      { name: 'description', type: 'string' },
      { name: 'hook', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'registerJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'policy', type: 'address' },
      { name: 'optParams', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'setBudget',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'optParams', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'fund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'jobCounter',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export type HireStep =
  | 'connecting'
  | 'creating'
  | 'registering'
  | 'budgeting'
  | 'approving'
  | 'funding'
  | 'done';

export interface ExternalHireProgress {
  step: HireStep;
  /** The real job id, known only after createJob has been mined. */
  jobId?: bigint;
  hash?: Hex;
}

export interface ExternalHireResult {
  jobId: bigint;
  hash: Hex;
  /** True when the whole thing went through one wallet_sendCalls batch. */
  atomic: boolean;
}

/**
 * Whatever `window.ethereum` turns out to be.
 *
 * Several extensions write to it and the last one loaded wins, so the address
 * this returns is not necessarily the wallet the person believes they are
 * using. The UI shows the connected address before anything is signed for
 * exactly that reason.
 */
function provider(): {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
} {
  const injected = (
    globalThis as unknown as {
      ethereum?: {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      };
    }
  ).ethereum;
  if (!injected) throw new Error('NO_WALLET');
  return injected;
}

export function hasInjectedWallet(): boolean {
  try {
    provider();
    return true;
  } catch {
    return false;
  }
}

function clients() {
  const transport = custom(provider());
  return {
    wallet: createWalletClient({ chain: WALLET_NETWORK as never, transport }),
    read: createPublicClient({
      chain: WALLET_NETWORK as never,
      transport: http(),
    }),
  };
}

export async function connectExternalWallet(): Promise<Address> {
  const accounts = (await provider().request({
    method: 'eth_requestAccounts',
  })) as Address[];
  if (!accounts?.length) throw new Error('NO_ACCOUNT');
  await ensureChain();
  return accounts[0];
}

/**
 * The chain, checked immediately before it matters.
 *
 * Checking once at connect is not enough: a wallet can be switched to another
 * network at any point, including between two of the five transactions, and
 * the second half of a hire landing on the wrong chain is the kind of failure
 * nobody can unpick afterwards.
 */
export async function ensureChain(): Promise<void> {
  const chainId = (await provider().request({ method: 'eth_chainId' })) as string;
  if (Number(chainId) === WALLET_NETWORK.chainId) return;

  try {
    await provider().request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${WALLET_NETWORK.chainId.toString(16)}` }],
    });
  } catch {
    throw new Error('WRONG_CHAIN');
  }

  const after = (await provider().request({ method: 'eth_chainId' })) as string;
  if (Number(after) !== WALLET_NETWORK.chainId) throw new Error('WRONG_CHAIN');
}

/** Whether this wallet can batch, per EIP-5792. */
async function supportsBatching(account: Address): Promise<boolean> {
  try {
    const caps = (await provider().request({
      method: 'wallet_getCapabilities',
      params: [account],
    })) as Record<string, { atomic?: { status?: string } } | undefined>;
    const chainKey = `0x${WALLET_NETWORK.chainId.toString(16)}`;
    const status = caps?.[chainKey]?.atomic?.status;
    return status === 'supported' || status === 'ready';
  } catch {
    return false;
  }
}

/**
 * Hire, from an ordinary wallet.
 *
 * Two routes. A wallet that supports EIP-5792 gets the five calls as one
 * batch, which restores the atomicity the relay used to give: predicting the
 * job id is safe there, because a collision reverts the whole thing and the
 * caller retries.
 *
 * Everything else goes one transaction at a time, and that path deliberately
 * does NOT predict the id. `buildHireCalls` bakes `jobCounter() + 1` into the
 * four calls after `createJob`, which is sound inside a batch and dangerous
 * outside one: sequentially, `createJob` can land after somebody else's and
 * take a different id, at which point setBudget, approve and fund all address
 * the job that took the predicted slot. That is not a failed hire, it is
 * funding a stranger's escrow. So the real id is read back from the receipt
 * before anything else is built.
 */
export async function hireFromExternalWallet(input: {
  provider: Address;
  task: string;
  budgetU: number;
  /** Seconds from now until the job expires. */
  ttlSeconds: number;
  onProgress?: (progress: ExternalHireProgress) => void;
}): Promise<ExternalHireResult> {
  const { wallet, read } = clients();
  const [account] = await wallet.getAddresses();
  if (!account) throw new Error('NO_ACCOUNT');

  await ensureChain();

  const addresses = correctedErc8183Addresses(WALLET_NETWORK.chainId);
  const budget = parseUnits(String(input.budgetU), 18);
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + input.ttlSeconds);
  const report = input.onProgress ?? (() => {});

  /*
   * Exactly the budget, never unlimited.
   *
   * An unlimited approval is the standard shortcut and the standard way funds
   * leave a wallet later — it outlives the job, and it is only as safe as the
   * contract holding it stays. An exact approval spent by the next call
   * leaves nothing behind.
   */
  const allowance = await read.readContract({
    address: addresses.paymentToken as Address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, addresses.commerce as Address],
  });

  if (await supportsBatching(account)) {
    const { buildHireCalls } = await import('@altananetwork/sdk');
    const counter = await read.readContract({
      address: addresses.commerce as Address,
      abi: KERNEL_ABI,
      functionName: 'jobCounter',
    });
    const jobId = counter + 1n;

    report({ step: 'creating', jobId });
    const id = (await provider().request({
      method: 'wallet_sendCalls',
      params: [
        {
          version: '2.0.0',
          chainId: `0x${WALLET_NETWORK.chainId.toString(16)}`,
          from: account,
          atomicRequired: true,
          calls: buildHireCalls({
            addresses,
            jobId,
            provider: input.provider,
            description: input.task,
            budget,
            expiredAt,
          }).map((call) => ({
            to: call.to,
            data: call.data,
            value: call.value ? `0x${call.value.toString(16)}` : '0x0',
          })),
        },
      ],
    })) as string;

    report({ step: 'done', jobId });
    return { jobId, hash: id as Hex, atomic: true };
  }

  // ---- Sequential. One transaction at a time, real id read from chain. ----

  report({ step: 'creating' });
  const createHash = await wallet.sendTransaction({
    account,
    to: addresses.commerce as Address,
    data: encodeFunctionData({
      abi: KERNEL_ABI,
      functionName: 'createJob',
      args: [
        input.provider,
        addresses.router as Address,
        expiredAt,
        input.task,
        '0x0000000000000000000000000000000000000000',
      ],
    }),
    chain: null,
  });
  await read.waitForTransactionReceipt({ hash: createHash });

  /*
   * The id this hire actually got, not the one it hoped for. Read after the
   * receipt so a job created in the same block by somebody else cannot be
   * mistaken for ours.
   */
  const jobId = await read.readContract({
    address: addresses.commerce as Address,
    abi: KERNEL_ABI,
    functionName: 'jobCounter',
  });

  const send = async (step: HireStep, data: Hex, to: Address) => {
    await ensureChain();
    report({ step, jobId });
    const hash = await wallet.sendTransaction({
      account,
      to,
      data,
      chain: null,
    });
    await read.waitForTransactionReceipt({ hash });
    return hash;
  };

  await send(
    'registering',
    encodeFunctionData({
      abi: KERNEL_ABI,
      functionName: 'registerJob',
      args: [jobId, addresses.policy as Address, '0x'],
    }),
    addresses.commerce as Address,
  );

  await send(
    'budgeting',
    encodeFunctionData({
      abi: KERNEL_ABI,
      functionName: 'setBudget',
      args: [jobId, budget, '0x'],
    }),
    addresses.commerce as Address,
  );

  if (allowance < budget) {
    /*
     * A non-zero allowance is set to zero before it is set again. Some ERC-20s
     * reject a non-zero-to-non-zero change outright, and the ones that do not
     * carry the classic race where both the old and new allowance can be
     * spent.
     */
    if (allowance > 0n) {
      await send(
        'approving',
        encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [addresses.commerce as Address, 0n],
        }),
        addresses.paymentToken as Address,
      );
    }

    await send(
      'approving',
      encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [addresses.commerce as Address, budget],
      }),
      addresses.paymentToken as Address,
    );
  }

  const fundHash = await send(
    'funding',
    encodeFunctionData({
      abi: KERNEL_ABI,
      functionName: 'fund',
      args: [jobId],
    }),
    addresses.commerce as Address,
  );

  report({ step: 'done', jobId, hash: fundHash });
  return { jobId, hash: fundHash, atomic: false };
}
