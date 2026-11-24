import { encodeFunctionData, erc20Abi, getAddress, type Address, type Hex } from 'viem';

import { jobLifetimeSeconds } from '@/lib/erc8183/deadline';
import { buildTokenHireCalls, type TokenHireAddresses } from '@/lib/erc8183/hire-calls';
import { decodePokterJobEnvelope, decodeReferenceJobDescription, encodePokterJobEnvelope, type PokterJobQuote } from '@/lib/erc8183/job-envelope';
import { checkPurchaseIntent, EXPIRY_MARGIN_SECONDS, type PurchaseIntent } from '@/lib/hire/purchase-intent';

/**
 * A hire funded from a wallet that signs one call at a time, after its
 * owner has seen a preview of each: an Agentic Wallet, driven by the
 * owner's own assistant through the wallet's CLI.
 *
 * Not a second way to pay. The calls are the five the browser makes
 * (`hireFromExternalWallet`), built by the same builders from the same
 * prepared terms and a fresh signed price, checked by the same
 * `checkPurchaseIntent`. What differs is only who signs and how: the
 * wallet previews and simulates every call and its owner approves each
 * one, so this never holds a key, signs or sends anything. It says which
 * call comes next, read from the chain each time, so a step that landed is
 * never offered twice and nothing depends on the assistant's memory.
 *
 * The approval comes first: it needs no job, and the agent's signed price
 * only has to stay valid from creating the job to funding it.
 */

/** Where an Agentic Wallet hires: the mainnet escrow, where the Agent ID registry and PokterBoard are. */
export const AGENTIC_CHAIN_ID = 56;

export const AGENTIC_STEPS = ['approve', 'create', 'register', 'budget', 'fund'] as const;
export type AgenticStep = (typeof AGENTIC_STEPS)[number];

/** One unsigned call, in the fields the wallet's preview takes. */
export interface AgenticCall {
  to: Address;
  value: '0';
  data: Hex;
}

export type AgenticNext =
  | {
      state: 'call';
      step: AgenticStep;
      /** Which of the five this is, 1-based. */
      number: number;
      of: 5;
      jobId: string | null;
      call: AgenticCall;
      /** What the preview must show for this call to be the right one; said to the owner before they approve. */
      expect: string;
      /** For `create`: pass back as `searchFrom` with the next request, so the new job is found even without its transaction. */
      searchFrom?: string;
      /**
       * The time, ISO, by which every call from `create` to `fund` must have
       * landed: a margin before the agent's signed price stops holding, as
       * the fund step refuses within it. Said to the owner before they
       * approve, because each call waits on them. Absent until the job's
       * price is known, and when the agent's price never lapses.
       */
      fundBy?: string;
    }
  | { state: 'funded'; jobId: string }
  | { state: 'stopped'; reason: string; jobId: string | null };

/** The prepared hire, as `prepare_hire` stored it. */
export interface AgenticTerms {
  agent: { chainId: number; tokenId: string; name: string; category: string };
  provider: Address;
  providerLabel: string | null;
  /** Exactly the text the seller signs. */
  task: string;
  token: { address: Address; symbol: string; decimals: number };
  amountRaw: bigint;
  /** The wallet the owner said would fund it, when they said. */
  owner: Address | null;
  /** The job it became, once funded. */
  jobId: string | null;
  /** The seller's delivery time before the dispute window: a chosen proposal's days, else the standing window (`deliverySecondsFor`). */
  deliverySeconds?: number;
}

export interface AgenticJob {
  client: Address;
  provider: Address;
  description: string;
  budget: bigint;
  expiredAt: bigint;
  status: number;
}

/** The chain, as the step logic reads it. The route passes a client; a test passes its own. */
export interface AgenticReader {
  jobCounter(): Promise<bigint>;
  job(jobId: bigint): Promise<AgenticJob>;
  /** The policy the router holds for a job; the zero address until it is registered. */
  jobPolicy(jobId: bigint): Promise<Address>;
  /** The token a job pays in; the zero address for the escrow's default token. */
  jobToken(jobId: bigint): Promise<Address>;
  allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  balance(token: Address, owner: Address): Promise<bigint>;
  disputeWindow(): Promise<number>;
}

/**
 * The SDK's `buildHireCalls`, which builds a hire in the escrow's default
 * token. Passed in by the route rather than imported, so this module loads
 * where the SDK cannot (the tests).
 */
export type DefaultHireCalls = (input: {
  addresses: never;
  jobId: bigint;
  provider: Address;
  description: string;
  budget: bigint;
  expiredAt: bigint;
}) => Array<{ to: Address; data?: Hex }>;

/** The agent's fresh signed price for the prepared task, as `/api/hire/quote` verified it. */
export interface AgenticQuote {
  quote: PokterJobQuote;
  intent: PurchaseIntent;
}

/* How far past `searchFrom` a new job is looked for: as the browser's own step check. */
const CREATED_SEARCH = 25n;
const FUNDED = 1;

export async function nextAgenticCall(input: {
  terms: AgenticTerms;
  wallet: Address;
  addresses: TokenHireAddresses;
  reader: AgenticReader;
  /** Asked only when the next call creates the job. */
  freshQuote: () => Promise<AgenticQuote | { error: string }>;
  buildDefaultCalls: DefaultHireCalls;
  jobId?: bigint | null;
  searchFrom?: bigint | null;
  now?: number;
}): Promise<AgenticNext> {
  const { terms, addresses, reader } = input;
  const wallet = getAddress(input.wallet);
  const now = input.now ?? Date.now();
  const token = getAddress(terms.token.address);
  const amount = terms.amountRaw;
  const money = `${formatRaw(amount, terms.token.decimals)} ${terms.token.symbol} (${token})`;

  if (terms.jobId) return { state: 'funded', jobId: terms.jobId };
  if (terms.owner && getAddress(terms.owner) !== wallet) {
    return { state: 'stopped', jobId: null, reason: `This hire was prepared for wallet ${terms.owner}, not ${wallet}. Prepare it again naming the wallet that will fund it.` };
  }

  const found = await locateJob();
  if (typeof found === 'string') return { state: 'stopped', jobId: input.jobId?.toString() ?? null, reason: found };

  const allowance = await reader.allowance(token, wallet, addresses.commerce);
  const approve = (to: bigint, jobId: string | null, fundBy?: string): AgenticNext => ({
    state: 'call',
    step: 'approve',
    number: 1,
    of: 5,
    jobId,
    ...(fundBy ? { fundBy } : {}),
    call: { to: token, value: '0', data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [addresses.commerce, to] }) },
    expect:
      to === 0n
        ? `Clears the escrow's earlier allowance on ${terms.token.symbol} to zero, so the next call can set it to exactly the price.`
        : `Allows the ERC-8183 escrow ${addresses.commerce} to take exactly ${money} from this wallet, and no more. Nothing moves yet.`,
  });

  if (!found) {
    if ((await reader.balance(token, wallet)) < amount) return { state: 'stopped', jobId: null, reason: `This wallet holds less than ${money}, the agent's price. Add it, then ask again.` };
    /* Some tokens refuse to change one non-zero allowance to another, so it goes through zero, as the browser does. */
    if (allowance > 0n && allowance < amount) return approve(0n, null);
    if (allowance < amount) return approve(amount, null);
    return create();
  }

  const { id, job } = found;
  const jobId = id.toString();
  if (job.status >= FUNDED) return { state: 'funded', jobId };
  /*
   * Once the agent's signed price has lapsed the job cannot be funded here,
   * so no further call is offered: registering it or setting its budget
   * would only cost the owner approvals and gas for a job that stays empty.
   */
  const signedUntil = described(job.description)?.signedUntil;
  if (signedUntil !== undefined && signedUntil * 1000 <= now + EXPIRY_MARGIN_SECONDS * 1000) {
    return {
      state: 'stopped',
      jobId,
      reason: `The agent's signed price for job #${jobId} has expired, so the agent may refuse a funded job. Nothing was funded: the job is open and holds no money. Prepare the hire again for a fresh price.`,
    };
  }
  const fundBy = fundByFor(signedUntil);
  const calls = callsFor(id, job.description, job.expiredAt);
  const step = (step: AgenticStep, index: number, expect: string): AgenticNext => ({
    state: 'call', step, number: AGENTIC_STEPS.indexOf(step) + 1, of: 5, jobId, call: unsigned(calls[index]), expect, ...(fundBy ? { fundBy } : {}),
  });

  if (getAddress(await reader.jobPolicy(id)) !== getAddress(addresses.policy)) {
    return step('register', 1, `Registers job #${jobId} with Pokter's dispute router ${addresses.router}, which names the policy ${addresses.policy} that settles it. No money moves.`);
  }
  if (job.budget !== amount) {
    return step('budget', 2, `Sets job #${jobId}'s budget to ${money}, the agent's signed price. No money moves.`);
  }
  if ((await reader.balance(token, wallet)) < amount) return { state: 'stopped', jobId, reason: `This wallet holds less than ${money}. Add it, then ask again; job #${jobId} is open and holds nothing.` };
  if (allowance < amount) return approve(allowance > 0n ? 0n : amount, jobId, fundBy);
  return step('fund', 4, `Funds job #${jobId}: moves ${money} from this wallet into the ERC-8183 escrow ${addresses.commerce}. The agent is paid only after it delivers and the review window passes without a dispute.`);

  /*
   * The job this wallet created for this hire: by its id when the caller
   * has it, or among the jobs created since `searchFrom`. A job counts only
   * if this wallet created it for this provider, in this token, for this
   * exact task, in either description Pokter writes (`described`).
   */
  async function locateJob(): Promise<{ id: bigint; job: AgenticJob } | null | string> {
    if (input.jobId) {
      const job = await reader.job(input.jobId);
      return (await belongs(input.jobId, job))
        ? { id: input.jobId, job }
        : `Job #${input.jobId} is not this hire: it was not created by ${wallet} for this agent and this exact brief.`;
    }
    if (!input.searchFrom) return null;
    const counter = await reader.jobCounter();
    for (let id = input.searchFrom; id <= counter && id < input.searchFrom + CREATED_SEARCH; id += 1n) {
      const job = await reader.job(id);
      if (await belongs(id, job)) return { id, job };
    }
    return null;
  }

  async function belongs(id: bigint, job: AgenticJob): Promise<boolean> {
    if (getAddress(job.client) !== wallet || getAddress(job.provider) !== getAddress(terms.provider)) return false;
    const description = described(job.description);
    if (!description || description.task !== terms.task) return false;
    if (description.identity && (description.identity.chainId !== terms.agent.chainId || description.identity.tokenId !== terms.agent.tokenId)) return false;
    if (description.escrow && getAddress(description.escrow) !== getAddress(addresses.commerce)) return false;
    const paid = await reader.jobToken(id);
    const paysIn = /^0x0{40}$/i.test(paid) ? getAddress(addresses.paymentToken) : getAddress(paid);
    return paysIn === token;
  }

  function callsFor(jobId: bigint, description: string, expiredAt: bigint) {
    return token === getAddress(addresses.paymentToken)
      ? input.buildDefaultCalls({ addresses: addresses as never, jobId, provider: terms.provider, description, budget: amount, expiredAt })
      : buildTokenHireCalls({ chainId: AGENTIC_CHAIN_ID, addresses, jobId, provider: terms.provider, description, budget: amount, expiredAt, token });
  }

  async function create(): Promise<AgenticNext> {
    const fresh = await input.freshQuote();
    if ('error' in fresh) return { state: 'stopped', jobId: null, reason: fresh.error };
    const check = checkPurchaseIntent(
      fresh.intent,
      { provider: terms.provider, task: terms.task, chainId: AGENTIC_CHAIN_ID, commerce: addresses.commerce, paymentToken: token, amountRaw: amount.toString() },
      now,
    );
    if (!check.ok) return { state: 'stopped', jobId: null, reason: check.reason };
    const description = encodePokterJobEnvelope({
      identityChainId: terms.agent.chainId,
      agentTokenId: terms.agent.tokenId,
      agentName: terms.agent.name,
      category: terms.agent.category,
      provider: terms.provider,
      providerLabel: terms.providerLabel ?? undefined,
      task: terms.task,
      quote: fresh.quote,
    });
    const expiredAt = BigInt(Math.floor(now / 1000) + jobLifetimeSeconds(await reader.disputeWindow(), terms.deliverySeconds));
    const [first] = callsFor(0n, description, expiredAt);
    const counter = await reader.jobCounter();
    const fundBy = fundByFor(fresh.quote.expiresAt);
    return {
      state: 'call',
      step: 'create',
      number: 2,
      of: 5,
      jobId: null,
      ...(fundBy ? { fundBy } : {}),
      call: unsigned(first),
      expect: `Creates a job on the ERC-8183 escrow ${addresses.commerce} for ${terms.agent.name} (provider ${terms.provider}), carrying the brief and the agent's signed price of ${money}. No money moves.`,
      searchFrom: (counter + 1n).toString(),
    };
  }
}

/*
 * A job's description as Pokter writes it, either way: its own envelope,
 * which names the agent, or, when the seller's quote carries one, the
 * seller's signed quote alone in the reference SDK's shape, which names no
 * agent but the escrow its price was signed for. The brief and the price's
 * expiry are in both.
 */
function described(description: string): { task: string; signedUntil: number | undefined; identity: { chainId: number; tokenId: string } | null; escrow: string | null } | null {
  const envelope = decodePokterJobEnvelope(description);
  if (envelope) return { task: envelope.task, signedUntil: envelope.quote?.expiresAt, identity: envelope.identity, escrow: envelope.quote?.domain?.verifyingContract ?? null };
  const reference = decodeReferenceJobDescription(description);
  return reference ? { task: reference.task, signedUntil: reference.quote.expiresAt, identity: null, escrow: reference.quote.domain?.verifyingContract ?? null } : null;
}

/* When the job must be funded by: the fund step's margin before the signed price stops holding, or nothing when it never does. */
function fundByFor(signedUntil: number | undefined): string | undefined {
  return signedUntil === undefined ? undefined : new Date((signedUntil - EXPIRY_MARGIN_SECONDS) * 1000).toISOString();
}

/* A built call as the wallet takes it. Every escrow call carries calldata; one without is a builder fault, never sent empty. */
function unsigned(call: { to: Address; data?: Hex }): AgenticCall {
  if (!call.data || call.data === '0x') throw new Error(`A hire call to ${call.to} was built without calldata.`);
  return { to: getAddress(call.to), value: '0', data: call.data };
}

function formatRaw(raw: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = raw / unit;
  const fraction = (raw % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
