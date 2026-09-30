import {
  createPublicClient, createWalletClient, custom,
  encodeFunctionData, erc20Abi, getAddress, http, parseUnits,
  type Address, type Hex,
} from 'viem';
import { buildHireCalls, getErc8183Job } from '@altananetwork/sdk';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { encodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { WALLET_NETWORK } from '@/lib/wallet/passkey';
import { jobCreatedFromReceipt } from '@/lib/wallet/external-receipt';

export type HireStep =
  | 'connecting' | 'creating' | 'registering' | 'budgeting'
  | 'approving' | 'funding' | 'confirming' | 'done';

export interface ExternalHireProgress { step: HireStep; jobId?: bigint; hash?: Hex }
export interface ExternalHireResult {
  jobId: bigint;
  transactionHash: Hex | null;
  callsId: string | null;
  atomic: boolean;
}
export interface ExternalHireInput {
  identityChainId: number;
  agentTokenId: string;
  agentName: string;
  category: string;
  provider: Address;
  providerLabel?: string;
  task: string;
  budgetU: number;
  ttlSeconds: number;
  onProgress?: (progress: ExternalHireProgress) => void;
}

type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function provider(): InjectedProvider {
  const injected = (globalThis as unknown as { ethereum?: InjectedProvider }).ethereum;
  if (!injected) throw new Error('NO_WALLET');
  return injected;
}

export function hasInjectedWallet(): boolean {
  try { provider(); return true; } catch { return false; }
}

function clients() {
  const transport = custom(provider());
  return {
    wallet: createWalletClient({ chain: WALLET_NETWORK as never, transport }),
    read: createPublicClient({
      chain: WALLET_NETWORK as never,
      transport: http(WALLET_NETWORK.publicRpcUrl),
    }),
  };
}

export async function connectExternalWallet(): Promise<Address> {
  const accounts = (await provider().request({ method: 'eth_requestAccounts' })) as Address[];
  if (!accounts?.length) throw new Error('NO_ACCOUNT');
  await ensureChain();
  return getAddress(accounts[0]);
}

export function onExternalAccountsChanged(
  listener: (accounts: Address[]) => void,
): () => void {
  const injected = provider() as InjectedProvider & {
    on?: (event: string, callback: (accounts: Address[]) => void) => void;
    removeListener?: (event: string, callback: (accounts: Address[]) => void) => void;
  };
  injected.on?.('accountsChanged', listener);
  return () => injected.removeListener?.('accountsChanged', listener);
}

export async function ensureChain(): Promise<void> {
  const chainId = (await provider().request({ method: 'eth_chainId' })) as string;
  if (Number(chainId) === WALLET_NETWORK.chainId) return;
  try {
    await provider().request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${WALLET_NETWORK.chainId.toString(16)}` }],
    });
  } catch { throw new Error('WRONG_CHAIN'); }
  const after = (await provider().request({ method: 'eth_chainId' })) as string;
  if (Number(after) !== WALLET_NETWORK.chainId) throw new Error('WRONG_CHAIN');
}

async function assertAccount(expected: Address): Promise<void> {
  const accounts = (await provider().request({ method: 'eth_accounts' })) as Address[];
  if (!accounts?.length || getAddress(accounts[0]) !== getAddress(expected)) {
    throw new Error('ACCOUNT_CHANGED');
  }
}

async function supportsAtomicBatch(account: Address): Promise<boolean> {
  try {
    const capabilities = (await provider().request({
      method: 'wallet_getCapabilities', params: [account],
    })) as Record<string, { atomic?: { status?: string } } | undefined>;
    const key = `0x${WALLET_NETWORK.chainId.toString(16)}`;
    return capabilities?.[key]?.atomic?.status === 'supported';
  } catch { return false; }
}

async function waitForCalls(callsId: string): Promise<Hex | null> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = (await provider().request({
      method: 'wallet_getCallsStatus', params: [callsId],
    })) as { status?: number | string; receipts?: { transactionHash?: Hex; status?: string }[] };
    if (result.status === 200 || result.status === 'CONFIRMED') {
      if (result.receipts?.some((receipt) => receipt.status && receipt.status !== '0x1')) {
        throw new Error('BATCH_REVERTED');
      }
      return result.receipts?.at(-1)?.transactionHash ?? null;
    }
    if (result.status === 400 || result.status === 500 || result.status === 'FAILED') {
      throw new Error('BATCH_REVERTED');
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error('BATCH_CONFIRMATION_TIMEOUT');
}

async function verifyFundedJob(input: {
  jobId: bigint; account: Address; provider: Address; budget: bigint; description: string;
}) {
  const job = await getErc8183Job(WALLET_NETWORK, input.jobId);
  if (
    getAddress(job.client) !== getAddress(input.account) ||
    getAddress(job.provider) !== getAddress(input.provider) ||
    job.budget !== input.budget || job.description !== input.description ||
    job.statusName !== 'FUNDED'
  ) throw new Error('FUNDED_JOB_VERIFICATION_FAILED');
}

export async function revokeExternalWalletAllowance(expectedAccount: Address): Promise<Hex> {
  await ensureChain();
  await assertAccount(expectedAccount);
  const { wallet, read } = clients();
  const addresses = correctedErc8183Addresses(WALLET_NETWORK.chainId);
  const hash = await wallet.sendTransaction({
    account: expectedAccount, to: addresses.paymentToken as Address,
    data: encodeFunctionData({
      abi: erc20Abi, functionName: 'approve',
      args: [addresses.commerce as Address, 0n],
    }), chain: null,
  });
  const receipt = await read.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('REVOKE_REVERTED');
  return hash;
}

export async function hireFromExternalWallet(input: ExternalHireInput): Promise<ExternalHireResult> {
  const { wallet, read } = clients();
  const [rawAccount] = await wallet.getAddresses();
  if (!rawAccount) throw new Error('NO_ACCOUNT');
  const account = getAddress(rawAccount);
  const addresses = correctedErc8183Addresses(WALLET_NETWORK.chainId);
  const budget = parseUnits(String(input.budgetU), 18);
  if (budget <= 0n) throw new Error('INVALID_BUDGET');
  if (!Number.isSafeInteger(input.ttlSeconds) || input.ttlSeconds <= 0) throw new Error('INVALID_EXPIRY');
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + input.ttlSeconds);
  const description = encodePokterJobEnvelope({
    identityChainId: input.identityChainId, agentTokenId: input.agentTokenId,
    agentName: input.agentName, category: input.category, provider: input.provider,
    providerLabel: input.providerLabel, task: input.task,
  });
  const report = input.onProgress ?? (() => {});
  await ensureChain();
  await assertAccount(account);

  const [allowance, balance] = await Promise.all([
    read.readContract({ address: addresses.paymentToken as Address, abi: erc20Abi,
      functionName: 'allowance', args: [account, addresses.commerce as Address] }),
    read.readContract({ address: addresses.paymentToken as Address, abi: erc20Abi,
      functionName: 'balanceOf', args: [account] }),
  ]);
  if (balance < budget) throw new Error('INSUFFICIENT_PAYMENT_TOKEN');
  const counter = await read.readContract({
    address: addresses.commerce as Address,
    abi: [{ name: 'jobCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
    functionName: 'jobCounter',
  });
  const predictedJobId = counter + 1n;
  const predicted = buildHireCalls({ addresses, jobId: predictedJobId,
    provider: input.provider, description, budget, expiredAt });

  if (await supportsAtomicBatch(account)) {
    const calls = [...predicted];
    if (allowance >= budget) calls.splice(3, 1);
    else if (allowance > 0n) calls.splice(3, 0, {
      to: addresses.paymentToken,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve',
        args: [addresses.commerce as Address, 0n] }),
    });
    report({ step: 'creating', jobId: predictedJobId });
    const callsId = (await provider().request({ method: 'wallet_sendCalls', params: [{
      version: '2.0.0', chainId: `0x${WALLET_NETWORK.chainId.toString(16)}`,
      from: account, atomicRequired: true,
      calls: calls.map((call) => ({ to: call.to, data: call.data,
        value: call.value ? `0x${call.value.toString(16)}` : '0x0' })),
    }] })) as string;
    report({ step: 'confirming', jobId: predictedJobId });
    const transactionHash = await waitForCalls(callsId);
    await verifyFundedJob({ jobId: predictedJobId, account,
      provider: input.provider, budget, description });
    report({ step: 'done', jobId: predictedJobId, hash: transactionHash ?? undefined });
    return { jobId: predictedJobId, transactionHash, callsId, atomic: true };
  }

  const send = async (step: HireStep, to: Address, data: Hex, jobId?: bigint) => {
    await ensureChain(); await assertAccount(account); report({ step, jobId });
    const hash = await wallet.sendTransaction({ account, to, data, chain: null });
    const receipt = await read.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${step.toUpperCase()}_REVERTED`);
    report({ step, jobId, hash });
    return { hash, receipt };
  };

  const created = await send('creating', predicted[0].to as Address, predicted[0].data!);
  const jobId = jobCreatedFromReceipt(created.receipt, addresses.commerce as Address,
    account, input.provider);
  const calls = buildHireCalls({ addresses, jobId, provider: input.provider,
    description, budget, expiredAt });
  await send('registering', calls[1].to as Address, calls[1].data!, jobId);
  await send('budgeting', calls[2].to as Address, calls[2].data!, jobId);
  if (allowance < budget) {
    if (allowance > 0n) await send('approving', addresses.paymentToken as Address,
      encodeFunctionData({ abi: erc20Abi, functionName: 'approve',
        args: [addresses.commerce as Address, 0n] }), jobId);
    await send('approving', calls[3].to as Address, calls[3].data!, jobId);
  }
  const funded = await send('funding', calls[4].to as Address, calls[4].data!, jobId);
  report({ step: 'confirming', jobId, hash: funded.hash });
  await verifyFundedJob({ jobId, account, provider: input.provider, budget, description });
  report({ step: 'done', jobId, hash: funded.hash });
  return { jobId, transactionHash: funded.hash, callsId: null, atomic: false };
}

export interface ExternalBalances {
  address: Address;
  /** Gas token, raw wei. */
  native: bigint;
  /** Payment token, raw units (18 decimals). */
  payment: bigint;
}

/**
 * What the connected wallet actually holds.
 *
 * Both figures matter and for different reasons: the gas token pays for as
 * many as five transactions here, and the payment token is the budget itself.
 * A buyer with one and not the other gets a failure part way through a
 * sequence, which is the worst place to discover a funding problem.
 */
export async function externalBalances(): Promise<ExternalBalances | null> {
  let account: Address | undefined;
  try {
    const accounts = (await provider().request({
      method: 'eth_accounts',
    })) as Address[];
    account = accounts?.[0];
  } catch {
    return null;
  }
  if (!account) return null;

  const { read } = clients();
  const addresses = correctedErc8183Addresses(WALLET_NETWORK.chainId);

  /*
   * Settled rather than awaited together: a payment-token read that fails
   * should not hide the gas balance. A missing number is shown as unknown,
   * which is the same rule the rest of the product follows.
   */
  const [native, payment] = await Promise.all([
    read.getBalance({ address: account }).catch(() => 0n),
    read
      .readContract({
        address: addresses.paymentToken as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account],
      })
      .catch(() => 0n),
  ]);

  return { address: account, native, payment };
}

/** The address currently authorised, without prompting for one. */
export async function externalAccount(): Promise<Address | null> {
  try {
    const accounts = (await provider().request({
      method: 'eth_accounts',
    })) as Address[];
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}
