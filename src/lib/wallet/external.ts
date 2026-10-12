import {
  createPublicClient, createWalletClient, custom, fallback,
  encodeFunctionData, erc20Abi, getAddress, http, parseUnits, stringToHex,
  type Address, type Hex,
} from 'viem';
import {
  buildClaimRefundCall,
  buildHireCalls,
  buildSubmitCall,
  getErc8183Job,
} from '@altananetwork/sdk';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { canSettle } from '@/lib/erc8183/settle-window';
import {
  encodePokterJobEnvelope,
  type PokterJobQuote,
} from '@/lib/erc8183/job-envelope';
import {
  buildSwapTransaction,
  quoteBnbForPaymentToken,
} from '@/lib/pancakeswap/swap';
import { browserRpcUrls, RECEIPT_POLL_MS } from '@/lib/wallet/browser-rpc';
import { WALLET_NETWORK, walletNetworkFor } from '@/lib/wallet/passkey';
import { jobCreatedFromReceipt } from '@/lib/wallet/external-receipt';

export type HireStep =
  | 'connecting' | 'swapping' | 'creating' | 'registering' | 'budgeting'
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
  /** The seller's signed quote, when the seller is the on-chain provider. */
  quote?: PokterJobQuote;
  budgetU: number;
  ttlSeconds: number;
  /** The escrow to fund, chosen per hire. Omitted, the site's default network. */
  escrowChainId?: number;
  onProgress?: (progress: ExternalHireProgress) => void;
}

type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/**
 * The provider every call below signs through.
 *
 * This read `window.ethereum` and nothing else, which was correct while the
 * only browser wallets were desktop extensions. A WalletConnect session
 * never touches `window.ethereum`: the wallet is on a phone and the pairing
 * lives in the connector. Left as it was, adding the connector would have
 * produced the worst version of this — connecting appears to work, the
 * address shows in the header, and every hire fails at the first signature
 * against an extension that was never there.
 *
 * So the connected provider is registered here when wagmi establishes a
 * session, and `window.ethereum` is the fallback for the plain injected
 * case before anything has connected.
 */
let connectedProvider: InjectedProvider | null = null;

/** Called by `ExternalProviderBridge` whenever the wagmi connector changes. */
export function setExternalProvider(next: InjectedProvider | null): void {
  connectedProvider = next;
}

function injectedProvider(): InjectedProvider | null {
  return (globalThis as unknown as { ethereum?: InjectedProvider }).ethereum ?? null;
}

function provider(): InjectedProvider {
  const resolved = connectedProvider ?? injectedProvider();
  if (!resolved) throw new Error('NO_WALLET');
  return resolved;
}

/** Whether anything can sign: a live session, or an extension to open one with. */
export function hasInjectedWallet(): boolean {
  return Boolean(connectedProvider ?? injectedProvider());
}

/*
 * Every escrow action takes the chain it acts on, because hires are funded on
 * the escrow that can pay the agent's price (see `escrowChainForHire`) and a
 * job is settled, reclaimed or delivered on the chain it was funded on.
 * Omitted, it is the site's default network, as before.
 */
function clients(chainId: number = WALLET_NETWORK.chainId) {
  const network = walletNetworkFor(chainId);
  const transport = custom(provider());
  return {
    wallet: createWalletClient({ chain: network as never, transport }),
    /*
     * Several endpoints, not one. A single shared public RPC rate-limits
     * the receipt poll and 403s mid-hire, after the wallet has already
     * been approved — see `browser-rpc`.
     */
    read: createPublicClient({
      chain: network as never,
      transport: fallback(
        browserRpcUrls(chainId, network.publicRpcUrl).map((url) => http(url)),
      ),
      pollingInterval: RECEIPT_POLL_MS,
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

export async function ensureChain(target: number = WALLET_NETWORK.chainId): Promise<void> {
  const chainId = (await provider().request({ method: 'eth_chainId' })) as string;
  if (Number(chainId) === target) return;
  try {
    await provider().request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${target.toString(16)}` }],
    });
  } catch { throw new Error('WRONG_CHAIN'); }
  const after = (await provider().request({ method: 'eth_chainId' })) as string;
  if (Number(after) !== target) throw new Error('WRONG_CHAIN');
}

async function assertAccount(expected: Address): Promise<void> {
  const accounts = (await provider().request({ method: 'eth_accounts' })) as Address[];
  if (!accounts?.length || getAddress(accounts[0]) !== getAddress(expected)) {
    throw new Error('ACCOUNT_CHANGED');
  }
}

async function supportsAtomicBatch(account: Address, chainId: number): Promise<boolean> {
  try {
    const capabilities = (await provider().request({
      method: 'wallet_getCapabilities', params: [account],
    })) as Record<string, { atomic?: { status?: string } } | undefined>;
    const key = `0x${chainId.toString(16)}`;
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
  chainId: number; jobId: bigint; account: Address; provider: Address; budget: bigint; description: string;
}) {
  const job = await getErc8183Job(walletNetworkFor(input.chainId), input.jobId);
  if (
    getAddress(job.client) !== getAddress(input.account) ||
    getAddress(job.provider) !== getAddress(input.provider) ||
    job.budget !== input.budget || job.description !== input.description ||
    job.statusName !== 'FUNDED'
  ) throw new Error('FUNDED_JOB_VERIFICATION_FAILED');
}

export async function revokeExternalWalletAllowance(
  expectedAccount: Address,
  chainId: number = WALLET_NETWORK.chainId,
): Promise<Hex> {
  await ensureChain(chainId);
  await assertAccount(expectedAccount);
  const { wallet, read } = clients(chainId);
  const addresses = correctedErc8183Addresses(chainId);
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

/**
 * What a refused escrow call means, in words.
 *
 * `0x32d53d69` is the kernel's refusal and it is already in this
 * codebase, mapped for the funding path, where it meant an unregistered
 * job. It carries no reason string, so the honest translation says what
 * was refused and what is known to cause it rather than inventing a
 * single cause.
 */
function explainSettleRevert(reason: unknown, action: 'approve' | 'dispute'): string {
  const error = reason as { message?: string; data?: unknown; cause?: { data?: unknown } };
  const text = [
    error?.message ?? '',
    typeof error?.data === 'string' ? error.data : '',
    typeof error?.cause?.data === 'string' ? error.cause.data : '',
  ].join(' ');
  const verb = action === 'approve' ? 'release the payment' : 'contest the delivery';
  if (text.includes('0x32d53d69')) {
    return `The escrow refused to ${verb} (revert 0x32d53d69). That usually means the review window has not elapsed, or the job's deadline has passed. Nothing was signed and nothing was spent.`;
  }
  return `The escrow would not ${verb}, so nothing was signed. The chain gave no reason: ${text.slice(0, 160)}`;
}

/** Release or contest escrow from the exact browser wallet that funded it. */
export async function settleFromExternalWallet(input: {
  account: Address;
  jobId: bigint;
  action: 'approve' | 'dispute';
  chainId?: number;
}): Promise<Hex> {
  const chainId = input.chainId ?? WALLET_NETWORK.chainId;
  const network = walletNetworkFor(chainId);
  await ensureChain(chainId);
  await assertAccount(input.account);
  const before = await getErc8183Job(network, input.jobId);
  if (getAddress(before.client) !== getAddress(input.account)) {
    throw new Error('The connected wallet did not fund this job.');
  }
  if (before.statusName !== 'SUBMITTED') {
    throw new Error(`This job is ${before.statusName.toLowerCase()} and cannot be settled.`);
  }

  const addresses = correctedErc8183Addresses(chainId);
  const { read: readTiming } = clients(chainId);

  /*
   * The escrow's own timing, before asking anyone to sign.
   *
   * Status alone is not enough: a SUBMITTED job refuses `settle` inside
   * the dispute window and again once its deadline has passed, and both
   * refusals used to reach the buyer as a gas-limit number from their
   * wallet. Reading the window costs one call and turns that into a
   * sentence they can act on.
   */
  const disputeWindowSeconds = await readTiming
    .readContract({
      address: addresses.policy as Address,
      abi: [{ name: 'disputeWindow', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] }] as const,
      functionName: 'disputeWindow',
    })
    .then(Number)
    .catch(() => 0);

  const verdict = canSettle(input.action, {
    submittedAt: Number(before.submittedAt),
    expiredAt: Number(before.expiredAt),
    disputeWindowSeconds,
    now: Math.floor(Date.now() / 1000),
  });
  if (!verdict.allowed) throw new Error(verdict.message);

  const target = input.action === 'approve' ? addresses.router : addresses.policy;
  const data = input.action === 'approve'
    ? encodeFunctionData({
        abi: [{ name: 'settle', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'evidence', type: 'bytes' }], outputs: [] }],
        functionName: 'settle', args: [input.jobId, '0x'],
      })
    : encodeFunctionData({
        abi: [{ name: 'dispute', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [] }],
        functionName: 'dispute', args: [input.jobId],
      });
  const { wallet, read } = clients(chainId);

  /*
   * Simulated before it is signed.
   *
   * A reverting call is what produced the gas-limit error: the wallet
   * cannot estimate it, falls back to the block gas limit, and the node
   * rejects that as over its cap. The buyer is then shown a number about
   * gas for a transaction that was never going to work. One `eth_call`
   * first means a refusal we did not anticipate is still a refusal,
   * rather than a signature request followed by an unreadable failure.
   */
  try {
    await read.request({
      method: 'eth_call',
      params: [{ from: input.account, to: target as Address, data }, 'latest'],
    });
  } catch (reason) {
    throw new Error(explainSettleRevert(reason, input.action));
  }

  const hash = await wallet.sendTransaction({
    account: input.account, to: target as Address, data, chain: null,
  });
  const receipt = await read.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The escrow transaction reverted.');
  const after = await getErc8183Job(network, input.jobId);
  const expected = input.action === 'approve' ? 'COMPLETED' : 'REJECTED';
  if (after.statusName !== expected) {
    throw new Error(`The transaction confirmed, but the job is ${after.statusName.toLowerCase()} instead of ${expected.toLowerCase()}.`);
  }
  return hash;
}

/**
 * Pull an expired escrow back to the wallet that funded it.
 *
 * The contract allows this once the job is past its expiry and nothing was
 * delivered. Pokter has been telling buyers the money is "still yours to
 * reclaim" on several screens without ever offering the action, which left
 * six expired escrows sitting untouched and the sentence doing no work.
 *
 * Checked against the chain before signing rather than against our index:
 * the index can be stale or incomplete, and the wallet is about to pay gas
 * for a transaction that would revert.
 */
export async function reclaimFromExternalWallet(input: {
  account: Address;
  jobId: bigint;
  chainId?: number;
}): Promise<Hex> {
  const chainId = input.chainId ?? WALLET_NETWORK.chainId;
  await ensureChain(chainId);
  await assertAccount(input.account);

  const before = await getErc8183Job(walletNetworkFor(chainId), input.jobId);
  if (getAddress(before.client) !== getAddress(input.account)) {
    throw new Error('The connected wallet did not fund this job.');
  }
  if (before.statusName !== 'FUNDED' && before.statusName !== 'EXPIRED') {
    throw new Error(
      `This job is ${before.statusName.toLowerCase()}; there is no escrow left to reclaim.`,
    );
  }
  if (Number(before.expiredAt) * 1000 > Date.now()) {
    throw new Error(
      'This job has not expired yet. The agent still has time to deliver.',
    );
  }

  const call = buildClaimRefundCall(chainId, input.jobId);
  const { wallet, read } = clients(chainId);
  const hash = await wallet.sendTransaction({
    account: input.account,
    to: call.to as Address,
    data: call.data as Hex,
    chain: null,
  });
  const receipt = await read.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(
      'The reclaim reverted. The most likely reason is that this escrow has ' +
        'already been returned — check the job on the explorer before trying ' +
        'again.',
    );
  }
  return hash;
}

/** Enough native left after a swap to still pay for the approve and the fund. */
const SWAP_GAS_HEADROOM = parseUnits('0.002', 18);

/** What a swap would cost, for the confirm screen, before anything is signed. */
export interface ExternalSwapPlan {
  /** $U still missing, in base units. */
  shortfallRaw: bigint;
  /** The most native the swap can spend, in base units. */
  maxNativeIn: bigint;
  /** Whether this wallet holds that much, with gas to spare. */
  affordable: boolean;
}

/**
 * Quote the shortfall without committing to it.
 *
 * Read-only: no wallet prompt, no chain switch, nothing signed. The
 * confirm screen calls this so somebody sees what their tBNB will be spent
 * on before the first signature, which is the whole difference between a
 * swap they agreed to and one that happened to them.
 *
 * Returns null when the wallet already holds the budget, so the caller can
 * treat "no plan" as "nothing to disclose".
 */
export async function planShortfallSwap(
  account: Address,
  budgetU: number,
  chainId: number = WALLET_NETWORK.chainId,
): Promise<ExternalSwapPlan | null> {
  const addresses = correctedErc8183Addresses(chainId);
  const { read } = clients(chainId);
  const budget = parseUnits(String(budgetU), 18);
  const [held, native] = await Promise.all([
    read.readContract({
      address: addresses.paymentToken as Address, abi: erc20Abi,
      functionName: 'balanceOf', args: [account],
    }) as Promise<bigint>,
    read.getBalance({ address: account }),
  ]);
  if (held >= budget) return null;

  const shortfallRaw = budget - held;
  const quote = await quoteBnbForPaymentToken(
    read as never, addresses.paymentToken as Address, shortfallRaw,
  );
  if (!quote) return { shortfallRaw, maxNativeIn: 0n, affordable: false };
  return {
    shortfallRaw,
    maxNativeIn: quote.amountInMaximum,
    affordable: native >= quote.amountInMaximum + SWAP_GAS_HEADROOM,
  };
}

async function acquireShortfall({
  read, wallet, account, budget, held, addresses, report,
}: {
  read: ReturnType<typeof clients>['read'];
  wallet: ReturnType<typeof clients>['wallet'];
  account: Address;
  budget: bigint;
  held: bigint;
  addresses: ReturnType<typeof correctedErc8183Addresses>;
  report: (progress: ExternalHireProgress) => void;
}): Promise<void> {
  const shortfall = budget - held;
  const quote = await quoteBnbForPaymentToken(
    read as never, addresses.paymentToken as Address, shortfall,
  );
  if (!quote) throw new Error('NO_SWAP_ROUTE');

  const native = await read.getBalance({ address: account });
  if (native < quote.amountInMaximum + SWAP_GAS_HEADROOM) {
    throw new Error('INSUFFICIENT_NATIVE_FOR_SWAP');
  }

  report({ step: 'swapping' });
  const swap = buildSwapTransaction(quote, addresses.paymentToken as Address, account);
  const hash = await wallet.sendTransaction({
    account, to: swap.to, data: swap.data, value: swap.value, chain: null,
  });
  const receipt = await read.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('SWAP_REVERTED');

  /*
   * Trust the chain, not the quote. `exactOutputSingle` guarantees its
   * output, but a route that paid out less would otherwise be discovered
   * two prompts later, inside the escrow call, with money already spent.
   */
  const after = (await read.readContract({
    address: addresses.paymentToken as Address, abi: erc20Abi,
    functionName: 'balanceOf', args: [account],
  })) as bigint;
  if (after < budget) throw new Error('INSUFFICIENT_PAYMENT_TOKEN');
}

export async function hireFromExternalWallet(input: ExternalHireInput): Promise<ExternalHireResult> {
  const chainId = input.escrowChainId ?? WALLET_NETWORK.chainId;
  const { wallet, read } = clients(chainId);
  const [rawAccount] = await wallet.getAddresses();
  if (!rawAccount) throw new Error('NO_ACCOUNT');
  const account = getAddress(rawAccount);
  const addresses = correctedErc8183Addresses(chainId);
  const budget = parseUnits(String(input.budgetU), 18);
  if (budget <= 0n) throw new Error('INVALID_BUDGET');
  if (!Number.isSafeInteger(input.ttlSeconds) || input.ttlSeconds <= 0) throw new Error('INVALID_EXPIRY');
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + input.ttlSeconds);
  const description = encodePokterJobEnvelope({
    identityChainId: input.identityChainId, agentTokenId: input.agentTokenId,
    agentName: input.agentName, category: input.category, provider: input.provider,
    providerLabel: input.providerLabel, task: input.task, quote: input.quote,
  });
  const report = input.onProgress ?? (() => {});
  await ensureChain(chainId);
  await assertAccount(account);

  const [allowance, balance] = await Promise.all([
    read.readContract({ address: addresses.paymentToken as Address, abi: erc20Abi,
      functionName: 'allowance', args: [account, addresses.commerce as Address] }),
    read.readContract({ address: addresses.paymentToken as Address, abi: erc20Abi,
      functionName: 'balanceOf', args: [account] }),
  ]);
  /*
   * Acquire the shortfall rather than refusing the hire.
   *
   * This threw and stopped. That was defensible while a passkey led the
   * sign-in and this was the fallback path, and it stopped being
   * defensible when the browser wallet became the recommended way in: the
   * campaign tells people to use one, they arrive from the faucet holding
   * tBNB and no $U, and this is the single shortfall that can be fixed
   * from inside the flow. The passkey path has acquired it since POK-018.
   *
   * Still one extra prompt rather than a batch, because an injected wallet
   * promises nothing about atomicity here and a swap that lands while the
   * hire fails leaves the buyer holding the $U they came for. The amount
   * is quoted and shown before anything is signed — see `planExternalSwap`.
   */
  if (balance < budget) {
    await acquireShortfall({
      read, wallet, account, budget, held: balance, addresses, report,
    });
  }
  const counter = await read.readContract({
    address: addresses.commerce as Address,
    abi: [{ name: 'jobCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
    functionName: 'jobCounter',
  });
  const predictedJobId = counter + 1n;
  const predicted = buildHireCalls({ addresses, jobId: predictedJobId,
    provider: input.provider, description, budget, expiredAt });

  if (await supportsAtomicBatch(account, chainId)) {
    const calls = [...predicted];
    if (allowance >= budget) calls.splice(3, 1);
    else if (allowance > 0n) calls.splice(3, 0, {
      to: addresses.paymentToken,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve',
        args: [addresses.commerce as Address, 0n] }),
    });
    report({ step: 'creating', jobId: predictedJobId });
    const callsId = (await provider().request({ method: 'wallet_sendCalls', params: [{
      version: '2.0.0', chainId: `0x${chainId.toString(16)}`,
      from: account, atomicRequired: true,
      calls: calls.map((call) => ({ to: call.to, data: call.data,
        value: call.value ? `0x${call.value.toString(16)}` : '0x0' })),
    }] })) as string;
    report({ step: 'confirming', jobId: predictedJobId });
    const transactionHash = await waitForCalls(callsId);
    await verifyFundedJob({ chainId, jobId: predictedJobId, account,
      provider: input.provider, budget, description });
    report({ step: 'done', jobId: predictedJobId, hash: transactionHash ?? undefined });
    return { jobId: predictedJobId, transactionHash, callsId, atomic: true };
  }

  const send = async (step: HireStep, to: Address, data: Hex, jobId?: bigint) => {
    await ensureChain(chainId); await assertAccount(account); report({ step, jobId });
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
  await verifyFundedJob({ chainId, jobId, account, provider: input.provider, budget, description });
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
export async function externalBalances(chainId: number = WALLET_NETWORK.chainId): Promise<ExternalBalances | null> {
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

  const { read } = clients(chainId);
  const addresses = correctedErc8183Addresses(chainId);

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

/** Submit a prepared immutable manifest from the exact provider EOA. */
export async function submitExternalDeliverable(input: {
  account: Address;
  jobId: bigint;
  deliverable: Hex;
  deliverableUrl: string;
  chainId?: number;
}): Promise<Hex> {
  const chainId = input.chainId ?? WALLET_NETWORK.chainId;
  const network = walletNetworkFor(chainId);
  await ensureChain(chainId);
  await assertAccount(input.account);
  const { wallet, read } = clients(chainId);
  const before = await getErc8183Job(network, input.jobId);
  if (getAddress(before.provider) !== getAddress(input.account)) throw new Error('NOT_JOB_PROVIDER');
  if (before.statusName !== 'FUNDED') throw new Error(`JOB_${before.statusName}`);
  if (before.expiredAt <= BigInt(Math.floor(Date.now() / 1000))) throw new Error('JOB_EXPIRED');
  const call = buildSubmitCall({
    addresses: correctedErc8183Addresses(chainId),
    jobId: input.jobId,
    deliverable: input.deliverable,
    optParams: stringToHex(JSON.stringify({ deliverable_url: input.deliverableUrl })),
  });
  const hash = await wallet.sendTransaction({ account: input.account, to: call.to as Address, data: call.data, chain: null });
  const receipt = await read.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('SUBMIT_REVERTED');
  const after = await getErc8183Job(network, input.jobId);
  if (after.statusName !== 'SUBMITTED' || after.deliverable.toLowerCase() !== input.deliverable.toLowerCase()) {
    throw new Error('SUBMISSION_VERIFICATION_FAILED');
  }
  return hash;
}
