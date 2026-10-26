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
import { jobLifetimeSeconds } from '@/lib/erc8183/deadline';
import { canSettleAs, settleCallerAllowed, type SettleCaller } from '@/lib/erc8183/settle-window';
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
import { describeFundingOutcome, fundingOutcome, retrySafe, type FundingOutcome } from '@/lib/hire/funding-outcome';
import { jobCreatedFromReceipt } from '@/lib/wallet/external-receipt';
import { checkPurchaseIntent, type PurchaseIntent } from '@/lib/hire/purchase-intent';
import { assertEscrowSupportsToken, buildTokenHireCalls, confirmJobToken, nonDefaultHireToken, readJobPaymentToken } from '@/lib/erc8183/hire-calls';

export type HireStep =
  | 'connecting' | 'swapping' | 'creating' | 'registering' | 'budgeting'
  | 'approving' | 'funding' | 'confirming' | 'done';

/*
 * Every identifier is reported the moment it exists — before any waiting —
 * so the caller can persist it (`hire/funding-journal`). `sentHash` is a
 * transaction the wallet handed back, mined or not; `predictedJobId` is the id
 * a batch expects; `jobId` is the job a receipt proved.
 */
export interface ExternalHireProgress { step: HireStep; jobId?: bigint; hash?: Hex; sentHash?: Hex; callsId?: string; predictedJobId?: bigint; description?: string; paymentToken?: Address; budgetRaw?: bigint; expiredAt?: bigint }
export interface ExternalHireResult {
  jobId: bigint;
  /** Seconds since the epoch, as written on chain. */
  expiredAt: bigint;
  transactionHash: Hex | null;
  callsId: string | null;
  atomic: boolean;
  /** The token the job is bound to, as funded. */
  paymentToken: Address;
  /** Exactly the amount funded, in that token's base units. */
  budgetRaw: bigint;
  /** False when the escrow could not be read back for the job's token; the hire is still funded and recorded. */
  tokenConfirmed: boolean;
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
  /** The terms that quote fixed; checked again just before the job is created. */
  intent?: PurchaseIntent;
  budgetU: number;
  /** Time for the seller to deliver. The escrow's dispute window is added to it (see `deadline.ts`). */
  ttlSeconds: number;
  /** The escrow to fund, chosen per hire. Omitted, the site's default network. */
  escrowChainId?: number;
  onProgress?: (progress: ExternalHireProgress) => void;
  /**
   * Called before every wallet request, with the step it is for. The caller
   * throws here when it no longer owns the attempt (`hire/funding-journal`),
   * which stops the hire before the wallet is asked.
   */
  beforePrompt?: (step: 'swapping' | 'creating' | 'registering' | 'budgeting' | 'approving' | 'funding' | 'batch') => void;
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

/**
 * The chain's answer about one funding attempt.
 *
 * Read after a confirmation timeout only. A missing job is a job that was
 * never funded; a job that is ours and past CREATED was funded even if the
 * wallet never said so. See `hire/funding-outcome.ts` for why the id being
 * taken by somebody else is "unknown" rather than "failed".
 */
async function readFundingOutcome(input: {
  chainId: number; jobId: bigint; account: Address; provider: Address; budget: bigint; description: string;
}): Promise<FundingOutcome> {
  const job = await getErc8183Job(walletNetworkFor(input.chainId), input.jobId).catch(() => null);
  return fundingOutcome(
    job && { client: job.client, provider: job.provider, budget: job.budget, description: job.description, statusName: job.statusName },
    { account: input.account, provider: input.provider, budget: input.budget, description: input.description },
  );
}

async function verifyFundedJob(input: {
  chainId: number; jobId: bigint; account: Address; provider: Address; budget: bigint; description: string;
  /** For a token hire: the job must be bound to exactly this token. */
  token?: Address;
}) {
  const job = await getErc8183Job(walletNetworkFor(input.chainId), input.jobId);
  if (
    getAddress(job.client) !== getAddress(input.account) ||
    getAddress(job.provider) !== getAddress(input.provider) ||
    job.budget !== input.budget || job.description !== input.description ||
    job.statusName !== 'FUNDED'
  ) throw new Error('FUNDED_JOB_VERIFICATION_FAILED');
  if (!input.token) return { tokenConfirmed: true };
  /*
   * The job is funded by now: the money has moved. A read that fails here is
   * the RPC, not the job, and treating it as a failed hire would leave a paid
   * job unrecorded and the buyer invited to pay again. So it is retried, and
   * if it still cannot be read the hire is recorded as funded with its token
   * unconfirmed (shown as unknown, filled in by the sweep). Only a token that
   * reads back as something else is an error, and its message says not to
   * fund again.
   */
  const { read } = clients(input.chainId);
  const commerce = correctedErc8183Addresses(input.chainId).commerce as Address;
  return { tokenConfirmed: (await confirmJobToken(read as never, commerce, input.jobId, input.token)) === 'confirmed' };
}

export async function revokeExternalWalletAllowance(
  expectedAccount: Address,
  chainId: number = WALLET_NETWORK.chainId,
  /** The token whose approval to revoke; the escrow default when omitted. */
  token?: Address,
): Promise<Hex> {
  await ensureChain(chainId);
  await assertAccount(expectedAccount);
  const { wallet, read } = clients(chainId);
  const addresses = correctedErc8183Addresses(chainId);
  const hash = await wallet.sendTransaction({
    account: expectedAccount, to: (token ?? addresses.paymentToken) as Address,
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
 * The router's custom errors, by selector. `0x32d53d69` was read as "the
 * review window has not elapsed, or the deadline has passed"; it is
 * PolicyNotSet: the job was never registered with a dispute policy, so it
 * can never be settled at all. Jobs 1202 and 1217 are that case, and were
 * taken as proof that an expired job cannot pay the seller, which the
 * contracts do not say: settle has no deadline check.
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
    return `The escrow refused to ${verb}: this job was never registered with a dispute policy (PolicyNotSet), so it can never be settled. After its deadline the escrow can be reclaimed. Nothing was signed and nothing was spent.`;
  }
  if (text.includes('0x17be5b7b')) {
    return `The escrow refused to ${verb}: the policy has not decided yet (NotDecided). The review window is still open. Nothing was signed and nothing was spent.`;
  }
  if (text.includes('0x8e78f0cb')) {
    return `The escrow refused to ${verb}: the job is no longer awaiting settlement (WrongStatus). It was already settled, refunded or reclaimed. Nothing was signed and nothing was spent.`;
  }
  return `The escrow would not ${verb}, so nothing was signed. The chain gave no reason: ${text.slice(0, 160)}`;
}

/**
 * Whether a transaction hash the wallet handed back actually exists.
 *
 * A wallet can return a hash for a transaction that never reaches the
 * network. It happened to a hand-delivery: the wallet reported
 * 0x9ebbabe3…, the receipt wait timed out, and the chain had no record
 * of it at all — not mined, not pending, the account's nonce untouched.
 *
 * That matters because the delivery composer remembers the hash so a
 * submission is never sent twice, and then offers only to re-confirm it.
 * For a hash that does not exist, re-confirming can never succeed and
 * the seller cannot deliver at all without clearing their own session
 * storage. Asking the chain is the difference between "already sent" and
 * "never arrived".
 */
export async function transactionExists(chainId: number, hash: Hex): Promise<boolean> {
  const { read } = clients(chainId);
  try {
    await read.getTransaction({ hash });
    return true;
  } catch {
    /* viem throws TransactionNotFound rather than returning null, and a
       transport failure is indistinguishable here — so an unreadable
       chain reports "exists" and the caller keeps its no-resend rule.
       Refusing to resend costs a retry; resending a live submission
       costs gas on a transaction the escrow will reject. */
    return false;
  }
}

/**
 * Release or contest escrow from a browser wallet.
 *
 * Both parties can release; only the buyer can contest. That asymmetry is
 * the contract's, not Pokter's, and it is measured rather than assumed:
 * see `settleCallerAllowed`, and testnet job #1502, which a wallet that
 * was neither party settled after its window closed.
 *
 * Pokter offers it to the two parties with a reason to care. A third
 * address is refused here for want of a surface, not want of permission —
 * so the message says that rather than claiming it cannot be done.
 */
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
  const account = getAddress(input.account);
  const caller: SettleCaller =
    getAddress(before.client) === account
      ? 'buyer'
      : getAddress(before.provider as Address) === account
        ? 'seller'
        : 'anyone-else';
  if (caller === 'anyone-else') {
    throw new Error('This wallet neither funded this job nor delivered it. Connect the buyer\u2019s wallet to review it, or the provider\u2019s to collect it.');
  }
  if (!settleCallerAllowed(input.action, caller)) {
    throw new Error('Only the wallet that funded this job can contest a delivery.');
  }
  /*
   * Said as what happened, not as a refusal. After the review window anyone
   * may release a job's payment, and keepers do: a buyer approving job 1457
   * was told it "is completed and cannot be settled", when the agent had
   * simply been paid twenty-five minutes earlier by someone else's call.
   */
  if (before.statusName === 'COMPLETED') {
    /*
     * Read by whoever asked. To the seller "the agent has already been
     * paid" is a sentence about themselves, and the money is in their
     * wallet — which is the one fact they want.
     */
    throw new Error(caller === 'seller'
      ? 'ALREADY_COMPLETED: This escrow has already been released and the payment is in your wallet. Anyone can release it after the review window, and someone did.'
      : 'ALREADY_COMPLETED: The agent has already been paid. After the review window anyone can release the escrow, and someone did. Nothing is left to do.');
  }
  if (before.statusName === 'REJECTED') {
    throw new Error('ALREADY_REJECTED: This job was already disputed and resolved, so there is nothing to release.');
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

  const verdict = canSettleAs(input.action, caller, {
    submittedAt: Number(before.submittedAt),
    expiredAt: Number(before.expiredAt),
    disputeWindowSeconds,
    now: Math.floor(Date.now() / 1000),
  });
  if (!verdict.allowed) throw new Error(verdict.message);
  // A second dispute would revert, or cost gas for nothing; the vote is already open.
  if (input.action === 'dispute' && (await readDisputeState(chainId, input.jobId)).disputed) {
    throw new Error('ALREADY_DISPUTED: This delivery is already disputed. The escrow policy’s voters decide it now.');
  }

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
  /*
   * A dispute does not reject the job. It opens a vote: whitelisted voters
   * call voteReject, and only a quorum of them makes the job REJECTED; if
   * none is reached by the deadline it expires and the buyer reclaims. So
   * the job stays SUBMITTED, and the page told the first mainnet buyer to
   * dispute that their confirmed dispute had come out "submitted instead
   * of rejected". What a dispute changes is the policy's own record.
   */
  if (input.action === 'dispute') {
    const state = await readDisputeState(chainId, input.jobId);
    if (!state.disputed) throw new Error('The transaction confirmed, but the escrow policy does not record a dispute for this job.');
    return hash;
  }
  const after = await getErc8183Job(network, input.jobId);
  if (after.statusName !== 'COMPLETED') {
    throw new Error(`The transaction confirmed, but the job is ${after.statusName.toLowerCase()} instead of completed.`);
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

const DISPUTE_WINDOW_ABI = [{ name: 'disputeWindow', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] }] as const;

/** The escrow policy's dispute window on `chainId`, in seconds. Read, never assumed: 15 minutes on testnet, 7 days on mainnet. */
export async function readDisputeWindow(chainId: number): Promise<number> {
  // Public RPC only: the hire page reads this before any wallet is connected.
  const network = walletNetworkFor(chainId);
  const read = createPublicClient({
    chain: network as never,
    transport: fallback(browserRpcUrls(chainId, network.publicRpcUrl).map((url) => http(url))),
  });
  const addresses = correctedErc8183Addresses(chainId);
  const window = await read.readContract({ address: addresses.policy as Address, abi: DISPUTE_WINDOW_ABI, functionName: 'disputeWindow' });
  return Number(window);
}

const JOB_TIMING_ABI = [{ name: 'getJob', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
  { name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'hook', type: 'address' }, { name: 'submittedAt', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' }] }] }] as const;

/**
 * When a delivered job was submitted, when it expires, and its policy's
 * dispute window: what the job page needs to say when the review window
 * closes. Public RPC only, so it reads before any wallet is connected.
 */
const DISPUTE_STATE_ABI = [
  { name: 'disputed', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'rejectVotes', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'voteQuorum', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'disputeQuorumSnapshot', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
] as const;

/**
 * Whether the policy records a dispute for a job, and how its vote stands.
 * A dispute leaves the job SUBMITTED; whitelisted voters call voteReject,
 * and `voteQuorum` of them make it REJECTED. Without a quorum by the
 * deadline the job expires and the buyer reclaims.
 */
export async function readDisputeState(chainId: number, jobId: bigint): Promise<{ disputed: boolean; rejectVotes: number; quorum: number }> {
  const network = walletNetworkFor(chainId);
  const read = createPublicClient({
    chain: network as never,
    transport: fallback(browserRpcUrls(chainId, network.publicRpcUrl).map((url) => http(url))),
  });
  const policy = correctedErc8183Addresses(chainId).policy as Address;
  /*
   * The quorum a dispute is judged against is the one fixed when it was
   * opened (disputeQuorumSnapshot), not the policy's current voteQuorum,
   * which an admin can change afterwards. The current one is only a
   * fallback for a policy without the snapshot.
   */
  const [disputed, rejectVotes, snapshot, current] = await Promise.all([
    read.readContract({ address: policy, abi: DISPUTE_STATE_ABI, functionName: 'disputed', args: [jobId] }),
    read.readContract({ address: policy, abi: DISPUTE_STATE_ABI, functionName: 'rejectVotes', args: [jobId] }).catch(() => 0n),
    read.readContract({ address: policy, abi: DISPUTE_STATE_ABI, functionName: 'disputeQuorumSnapshot', args: [jobId] }).catch(() => 0n),
    read.readContract({ address: policy, abi: DISPUTE_STATE_ABI, functionName: 'voteQuorum' }).catch(() => 0n),
  ]);
  return { disputed, rejectVotes: Number(rejectVotes), quorum: Number(snapshot > 0n ? snapshot : current) };
}

export async function readReviewTiming(chainId: number, jobId: bigint): Promise<{ submittedAt: number; expiredAt: number; disputeWindowSeconds: number }> {
  const network = walletNetworkFor(chainId);
  const read = createPublicClient({
    chain: network as never,
    transport: fallback(browserRpcUrls(chainId, network.publicRpcUrl).map((url) => http(url))),
  });
  const addresses = correctedErc8183Addresses(chainId);
  const [job, disputeWindowSeconds] = await Promise.all([
    read.readContract({ address: addresses.commerce as Address, abi: JOB_TIMING_ABI, functionName: 'getJob', args: [jobId] }),
    readDisputeWindow(chainId),
  ]);
  return { submittedAt: Number(job.submittedAt), expiredAt: Number(job.expiredAt), disputeWindowSeconds };
}

export async function hireFromExternalWallet(input: ExternalHireInput): Promise<ExternalHireResult> {
  const chainId = input.escrowChainId ?? WALLET_NETWORK.chainId;
  const { wallet, read } = clients(chainId);
  const [rawAccount] = await wallet.getAddresses();
  if (!rawAccount) throw new Error('NO_ACCOUNT');
  const account = getAddress(rawAccount);
  const addresses = correctedErc8183Addresses(chainId);
  /*
   * The token is the one the seller signed, and nothing else decides it. A
   * $U price (or no signed price) returns null and the hire below is the
   * one it has always been. A USDT price funds USDT, for exactly the signed
   * amount — never `budgetU`, which is a number typed in $U — and a token
   * Pokter does not offer here throws before any prompt.
   */
  const tokenHire = nonDefaultHireToken(chainId, input.intent?.currency);
  if (tokenHire && !input.intent) throw new Error('TOKEN_HIRE_NEEDS_SIGNED_QUOTE');
  const payToken = (tokenHire?.address ?? addresses.paymentToken) as Address;
  const budget = tokenHire ? BigInt(input.intent!.amountRaw) : parseUnits(String(input.budgetU), 18);
  if (budget <= 0n) throw new Error('INVALID_BUDGET');
  if (!Number.isSafeInteger(input.ttlSeconds) || input.ttlSeconds <= 0) throw new Error('INVALID_EXPIRY');
  // The dispute window has to fit after delivery, or the seller's submit reverts.
  const disputeWindow = await readDisputeWindow(chainId);
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + jobLifetimeSeconds(disputeWindow, input.ttlSeconds));
  const description = encodePokterJobEnvelope({
    identityChainId: input.identityChainId, agentTokenId: input.agentTokenId,
    agentName: input.agentName, category: input.category, provider: input.provider,
    providerLabel: input.providerLabel, task: input.task, quote: input.quote,
  });
  const report = input.onProgress ?? (() => {});
  await ensureChain(chainId);
  await assertAccount(account);
  if (tokenHire) await assertEscrowSupportsToken(read as never, addresses.commerce as Address, payToken);

  const [allowance, balance] = await Promise.all([
    read.readContract({ address: payToken, abi: erc20Abi,
      functionName: 'allowance', args: [account, addresses.commerce as Address] }),
    read.readContract({ address: payToken, abi: erc20Abi,
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
    /*
     * The swap buys the escrow's default token, so it cannot cover a USDT
     * hire. Said plainly instead: nothing is swapped into a token the buyer
     * did not ask for, and nothing has been signed yet.
     */
    if (tokenHire) throw new Error('INSUFFICIENT_HIRE_TOKEN');
    input.beforePrompt?.('swapping');
    await acquireShortfall({
      read, wallet, account, budget, held: balance, addresses, report,
    });
  }
  /*
   * Last look before any job exists. Approvals and a swap may have taken
   * minutes; the price can expire meanwhile, and the terms must still be the
   * ones signed. A mismatch here sends nothing further.
   */
  if (input.intent) {
    const check = checkPurchaseIntent(input.intent, {
      provider: input.provider, task: input.task, chainId, commerce: addresses.commerce, paymentToken: payToken,
      ...(tokenHire ? { amountRaw: budget.toString() } : {}),
    });
    if (!check.ok) throw new Error(check.reason);
  }
  const counter = await read.readContract({
    address: addresses.commerce as Address,
    abi: [{ name: 'jobCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
    functionName: 'jobCounter',
  });
  const predictedJobId = counter + 1n;
  const hireCalls = (jobId: bigint) => tokenHire
    ? buildTokenHireCalls({ chainId, addresses: addresses as never, jobId, provider: input.provider, description, budget, expiredAt, token: payToken })
    : buildHireCalls({ addresses, jobId, provider: input.provider, description, budget, expiredAt });
  const predicted = hireCalls(predictedJobId);
  /*
   * Everything a reconciliation needs, reported before the first prompt so
   * the caller can persist the attempt first. A caller that throws here (an
   * attempt already open for this wallet) stops the hire before any wallet
   * is asked.
   */
  report({ step: 'creating', predictedJobId, description, paymentToken: payToken, budgetRaw: budget, expiredAt });
  const ask = input.beforePrompt ?? (() => {});

  /*
   * One atomic batch only for $U. For another token the batch is the same
   * calls, but that path has not been run end to end, so it is sent one
   * transaction at a time (`network/hire-paths`).
   */
  if (!tokenHire && await supportsAtomicBatch(account, chainId)) {
    const calls = [...predicted];
    if (allowance >= budget) calls.splice(3, 1);
    else if (allowance > 0n) calls.splice(3, 0, {
      to: payToken,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve',
        args: [addresses.commerce as Address, 0n] }),
    });
    report({ step: 'creating', jobId: predictedJobId, predictedJobId });
    ask('batch');
    const callsId = (await provider().request({ method: 'wallet_sendCalls', params: [{
      version: '2.0.0', chainId: `0x${chainId.toString(16)}`,
      from: account, atomicRequired: true,
      calls: calls.map((call) => ({ to: call.to, data: call.data,
        value: call.value ? `0x${call.value.toString(16)}` : '0x0' })),
    }] })) as string;
    report({ step: 'confirming', jobId: predictedJobId, predictedJobId, callsId });
    let transactionHash: Hex | null;
    try {
      transactionHash = await waitForCalls(callsId);
    } catch (error) {
      /*
       * The wallet stopped reporting. That says we stopped watching, not
       * that the money stayed put, and the retry beside a generic error is
       * how a buyer pays twice. Ask the chain what happened.
       */
      if (!(error instanceof Error) || error.message !== 'BATCH_CONFIRMATION_TIMEOUT') throw error;
      const outcome = await readFundingOutcome({ chainId, jobId: predictedJobId, account, provider: input.provider, budget, description });
      if (outcome !== 'funded') {
        const unresolved = new Error(describeFundingOutcome(outcome));
        unresolved.name = retrySafe(outcome) ? 'FUNDING_NOT_SENT' : 'FUNDING_UNRESOLVED';
        throw unresolved;
      }
      /*
       * It landed. Carry on without a hash we never saw, through the same
       * verification as any other hire — the job still has to match what
       * was agreed before this is called a success.
       */
      transactionHash = null;
    }
    const { tokenConfirmed } = await verifyFundedJob({ chainId, jobId: predictedJobId, account,
      provider: input.provider, budget, description, ...(tokenHire ? { token: payToken } : {}) });
    report({ step: 'done', jobId: predictedJobId, hash: transactionHash ?? undefined });
    return { jobId: predictedJobId, expiredAt, transactionHash, callsId, atomic: true, paymentToken: payToken, budgetRaw: budget, tokenConfirmed };
  }

  const send = async (step: HireStep, to: Address, data: Hex, jobId?: bigint) => {
    await ensureChain(chainId); await assertAccount(account); report({ step, jobId });
    ask(step as Parameters<typeof ask>[0]);
    const hash = await wallet.sendTransaction({ account, to, data, chain: null });
    /* Reported before waiting: a receipt that never comes must not lose the hash. */
    report({ step, jobId, sentHash: hash });
    const receipt = await read.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${step.toUpperCase()}_REVERTED`);
    report({ step, jobId, hash });
    return { hash, receipt };
  };

  const created = await send('creating', predicted[0].to as Address, predicted[0].data!);
  const jobId = jobCreatedFromReceipt(created.receipt, addresses.commerce as Address,
    account, input.provider);
  const calls = hireCalls(jobId);
  await send('registering', calls[1].to as Address, calls[1].data!, jobId);
  await send('budgeting', calls[2].to as Address, calls[2].data!, jobId);
  if (allowance < budget) {
    if (allowance > 0n) await send('approving', payToken,
      encodeFunctionData({ abi: erc20Abi, functionName: 'approve',
        args: [addresses.commerce as Address, 0n] }), jobId);
    await send('approving', calls[3].to as Address, calls[3].data!, jobId);
  }
  const funded = await send('funding', calls[4].to as Address, calls[4].data!, jobId);
  report({ step: 'confirming', jobId, hash: funded.hash });
  const { tokenConfirmed } = await verifyFundedJob({ chainId, jobId, account, provider: input.provider, budget, description, ...(tokenHire ? { token: payToken } : {}) });
  report({ step: 'done', jobId, hash: funded.hash });
  return { jobId, expiredAt, transactionHash: funded.hash, callsId: null, atomic: false, paymentToken: payToken, budgetRaw: budget, tokenConfirmed };
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
export async function externalBalances(chainId: number = WALLET_NETWORK.chainId, token?: Address): Promise<ExternalBalances | null> {
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
        address: (token ?? addresses.paymentToken) as Address,
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
  let receipt;
  try {
    receipt = await read.waitForTransactionReceipt({ hash });
  } catch (reason) {
    /*
     * A wallet can hand back a hash for a transaction the network never
     * receives. Waiting then times out with "Timed out while waiting for
     * transaction … to be confirmed", which sends the reader to look for
     * a slow confirmation that does not exist — the chain had no record
     * of 0x9ebbabe3… at all, and the account's nonce never moved.
     *
     * Asking once more distinguishes the two, so the message says which
     * happened and whether anything may still land.
     */
    if (!(await transactionExists(chainId, hash))) {
      throw new Error('SUBMIT_NOT_BROADCAST');
    }
    throw reason;
  }
  if (receipt.status !== 'success') throw new Error('SUBMIT_REVERTED');
  const after = await getErc8183Job(network, input.jobId);
  if (after.statusName !== 'SUBMITTED' || after.deliverable.toLowerCase() !== input.deliverable.toLowerCase()) {
    throw new Error('SUBMISSION_VERIFICATION_FAILED');
  }
  return hash;
}


/**
 * The chain reads a funding attempt is reconciled with (`hire/funding-journal`):
 * receipts by hash, a batch's status from the wallet, and jobs from the
 * escrow. Public RPC for everything but the batch, which only the wallet
 * that sent it can describe.
 */
export function attemptReader(chainId: number, account: Address, providerAddress: Address) {
  const network = walletNetworkFor(chainId);
  const read = createPublicClient({ chain: network as never, transport: fallback(browserRpcUrls(chainId, network.publicRpcUrl).map((url) => http(url))) });
  const commerce = correctedErc8183Addresses(chainId).commerce as Address;
  return {
    async receipt(hash: string) {
      const receipt = await read.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
      return receipt ? { status: receipt.status === 'success' ? ('success' as const) : ('reverted' as const), logs: receipt.logs as unknown[] } : null;
    },
    async calls(callsId: string) {
      const result = (await provider().request({ method: 'wallet_getCallsStatus', params: [callsId] }).catch(() => null)) as { status?: number | string; receipts?: { status?: string; logs?: unknown[] }[] } | null;
      if (!result) return null;
      if (result.status === 200 || result.status === 'CONFIRMED') {
        const failed = result.receipts?.some((r) => r.status && r.status !== '0x1');
        return { status: failed ? ('failure' as const) : ('success' as const), logs: (result.receipts ?? []).flatMap((r) => r.logs ?? []) };
      }
      if (result.status === 400 || result.status === 500 || result.status === 'FAILED') return { status: 'failure' as const, logs: [] };
      return { status: 'pending' as const, logs: [] };
    },
    async job(jobId: bigint) {
      const job = await getErc8183Job(network, jobId);
      /* `expiredAt` too: a recovered job keeps the deadline the escrow holds, not the time it was recovered. */
      return { client: job.client, provider: job.provider, budget: job.budget, description: job.description, statusName: job.statusName, expiredAt: job.expiredAt };
    },
    jobIdFrom(logs: unknown[]) {
      try {
        return jobCreatedFromReceipt({ logs } as never, commerce, account, providerAddress);
      } catch {
        return null;
      }
    },
    /** The chain's clock, in seconds: what an attempt's expiry is compared against. */
    async chainNow() {
      return Number((await read.getBlock({ blockTag: 'latest' })).timestamp);
    },
    /** The token a recovered job is bound to; unread stays unknown. */
    async token(jobId: bigint) {
      return readJobPaymentToken(read as never, commerce, jobId);
    },
  };
}
