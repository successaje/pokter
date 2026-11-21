import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeFunctionData, erc20Abi, getAddress, parseAbi, type Address } from 'viem';

import { decodePokterJobEnvelope } from '../src/lib/erc8183/job-envelope';
import { nextAgenticCall, type AgenticJob, type AgenticQuote, type AgenticReader, type AgenticTerms } from '../src/lib/hire/agentic';

/*
 * A hire from a wallet that signs one previewed call at a time. The chain
 * here is a fake the test moves forward after each call, as the wallet
 * would: every answer is read from it, never from what was asked before.
 */

process.env.NEXT_PUBLIC_HIRE_TOKENS = '56:0x55d398326f99059fF775485246999027B3197955';

/* BNB Smart Chain's escrow, router, policy and default token, as the SDK lists them (the SDK itself does not load under the test runner). */
const addresses = {
  commerce: getAddress('0xEa4DAa3100A767e86FDed867729ae7446476EBA6'),
  router: getAddress('0x51895229E12F9876011789B04f8698af06cCD6DA'),
  policy: getAddress('0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5'),
  paymentToken: getAddress('0xcE24439F2D9C6a2289F741120FE202248B666666'),
};
const WALLET: Address = '0x7751bE7B2BA4141D5E32Ef14e9E5cc73e9D7bf0C';
const PROVIDER: Address = '0x81762d5214fCB6fB3b102beF9D69d13A56c1a2d0';
const USDT: Address = '0x55d398326f99059fF775485246999027B3197955';
const PRICE = 50_000_000_000_000_000n; // 0.05
const T = Date.parse('2026-11-25T12:00:00Z');

const COMMERCE = parseAbi([
  'function createJobWithToken(address provider, address evaluator, uint256 expiredAt, string description, address hook, address token)',
  'function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook)',
  'function setBudget(uint256 jobId, uint256 amount, bytes optParams)',
  'function fund(uint256 jobId, uint256 expectedBudget, bytes optParams)',
]);
const ROUTER = parseAbi(['function registerJob(uint256 jobId, address policy)']);

function terms(overrides: Partial<AgenticTerms> = {}): AgenticTerms {
  return {
    agent: { chainId: 56, tokenId: '1220', name: 'Ledgerline', category: 'research' },
    provider: PROVIDER,
    providerLabel: 'registered agent wallet',
    task: 'Summarise the last week of Venus liquidations on BNB Chain in five bullet points.',
    token: { address: USDT, symbol: 'USDT', decimals: 18 },
    amountRaw: PRICE,
    owner: null,
    jobId: null,
    ...overrides,
  };
}

function quote(over: Partial<AgenticQuote['intent']> = {}): AgenticQuote {
  const expiresAt = Math.floor(T / 1000) + 600;
  return {
    quote: { negotiationHash: '0x' + 'ab'.repeat(32), providerSignature: '0x' + 'cd'.repeat(65), priceRaw: PRICE.toString(), expiresAt, domain: { chainId: 56, verifyingContract: getAddress(addresses.commerce) } },
    intent: { provider: PROVIDER, task: terms().task, amountRaw: PRICE.toString(), currency: USDT, chainId: 56, verifyingContract: getAddress(addresses.commerce), expiresAt, negotiationHash: '0x' + 'ab'.repeat(32), ...over },
  };
}

/* An escrow, a router and a token, enough to answer the step logic and to apply the calls it returns. */
function chain() {
  const jobs = new Map<bigint, AgenticJob & { token: Address }>();
  const policies = new Map<bigint, Address>();
  let counter = 57_300n;
  let allowance = 0n;
  let balance = 1_000_000_000_000_000_000n;
  const reader: AgenticReader = {
    jobCounter: async () => counter,
    job: async (id) => {
      const job = jobs.get(id);
      if (!job) throw new Error(`no job ${id}`);
      return job;
    },
    jobPolicy: async (id) => policies.get(id) ?? '0x0000000000000000000000000000000000000000',
    jobToken: async (id) => jobs.get(id)?.token ?? '0x0000000000000000000000000000000000000000',
    allowance: async () => allowance,
    balance: async () => balance,
    disputeWindow: async () => 7 * 86_400,
  };
  /* What the escrow does when the wallet sends this call. */
  function apply(call: { to: Address; data: `0x${string}` }, from: Address = WALLET) {
    if (getAddress(call.to) === getAddress(USDT)) {
      const { args } = decodeFunctionData({ abi: erc20Abi, data: call.data });
      assert.equal(getAddress(args[0] as Address), getAddress(addresses.commerce), 'only ever the escrow is approved');
      allowance = args[1] as bigint;
      return;
    }
    if (getAddress(call.to) === getAddress(addresses.router)) {
      const { args } = decodeFunctionData({ abi: ROUTER, data: call.data });
      policies.set(args[0], args[1]);
      return;
    }
    const { functionName, args } = decodeFunctionData({ abi: COMMERCE, data: call.data });
    if (functionName === 'createJobWithToken') {
      counter += 1n;
      jobs.set(counter, { client: from, provider: args[0], description: args[3], budget: 0n, expiredAt: args[2], status: 0, token: args[5] });
    } else if (functionName === 'setBudget') {
      jobs.get(args[0])!.budget = args[1];
    } else if (functionName === 'fund') {
      const job = jobs.get(args[0])!;
      assert.equal(args[1], job.budget);
      assert.ok(allowance >= job.budget);
      allowance -= job.budget;
      balance -= job.budget;
      job.status = 1;
    } else {
      assert.fail(`unexpected ${functionName}`);
    }
  }
  return { reader, apply, jobs, setBalance: (b: bigint) => void (balance = b), setAllowance: (a: bigint) => void (allowance = a), bumpCounter: () => void (counter += 1n) };
}

async function next(c: ReturnType<typeof chain>, extra: { jobId?: bigint; searchFrom?: bigint; terms?: AgenticTerms; quote?: AgenticQuote | { error: string }; now?: number } = {}) {
  return nextAgenticCall({
    terms: extra.terms ?? terms(),
    wallet: WALLET,
    addresses: addresses as never,
    reader: c.reader,
    freshQuote: async () => extra.quote ?? quote(),
    buildDefaultCalls: () => assert.fail('a USDT hire is built by the token builder, not the SDK’s'),
    jobId: extra.jobId ?? null,
    searchFrom: extra.searchFrom ?? null,
    now: extra.now ?? T,
  });
}

test('the five calls come in order, each read from the chain, and end funded', async () => {
  const c = chain();
  const seen: string[] = [];
  let searchFrom: bigint | undefined;
  let jobId: bigint | undefined;
  for (let i = 0; i < 6; i += 1) {
    // The wallet's own transaction is never passed: the job is found from the chain.
    const step = await next(c, { searchFrom, jobId });
    if (step.state === 'funded') {
      seen.push(`funded #${step.jobId}`);
      break;
    }
    assert.equal(step.state, 'call', JSON.stringify(step));
    if (step.state !== 'call') return;
    seen.push(`${step.number} ${step.step}`);
    assert.equal(step.call.value, '0');
    if (step.searchFrom) searchFrom = BigInt(step.searchFrom);
    c.apply(step.call);
    if (step.jobId) jobId = BigInt(step.jobId);
  }
  assert.deepEqual(seen, ['1 approve', '2 create', '3 register', '4 budget', '5 fund', 'funded #57301']);
  const job = c.jobs.get(57_301n)!;
  const envelope = decodePokterJobEnvelope(job.description);
  assert.equal(envelope?.task, terms().task, 'the job carries exactly the signed brief');
  assert.equal(envelope?.identity.tokenId, '1220');
  assert.equal(envelope?.quote?.providerSignature, quote().quote.providerSignature, 'and the agent’s signed price');
  assert.ok(job.expiredAt > BigInt(Math.floor(T / 1000) + 7 * 86_400), 'its deadline leaves room for the dispute window');
});

/* As production's quote route answers: the seller's signed quote in the reference SDK's shape rides along, and becomes the whole description. */
function anchored(expiresAt = Math.floor(T / 1000) + 600): AgenticQuote {
  const plain = quote();
  const anchor = {
    version: 1, negotiated_at: Math.floor(T / 1000), task: terms().task, terms: { deliverables: 'A JSON assessment.' },
    price: PRICE.toString(), currency: USDT, quote_expires_at: expiresAt, chain_id: 56, verifying_contract: getAddress(addresses.commerce),
    negotiation_hash: plain.quote.negotiationHash, provider_sig: plain.quote.providerSignature,
  };
  return { quote: { ...plain.quote, expiresAt, anchor }, intent: { ...plain.intent, expiresAt } };
}

test('a job written as the seller’s signed quote alone is found again, and created once', async () => {
  const c = chain();
  c.setAllowance(PRICE);
  const create = await next(c, { quote: anchored() });
  if (create.state !== 'call' || create.step !== 'create') return assert.fail(JSON.stringify(create));
  c.apply(create.call);
  const description = c.jobs.get(57_301n)!.description;
  assert.equal(decodePokterJobEnvelope(description), null, 'no Pokter envelope: the anchor is the whole description');
  assert.equal(JSON.parse(description).provider_sig, quote().quote.providerSignature);

  const seen: string[] = [];
  let jobId: bigint | undefined;
  for (let i = 0; i < 4; i += 1) {
    const step = await next(c, { searchFrom: BigInt(create.searchFrom!), jobId, quote: anchored() });
    if (step.state === 'funded') { seen.push('funded'); break; }
    if (step.state !== 'call') return assert.fail(JSON.stringify(step));
    seen.push(step.step);
    c.apply(step.call);
    if (step.jobId) jobId = BigInt(step.jobId);
  }
  assert.deepEqual(seen, ['register', 'budget', 'fund', 'funded'], 'never a second create');
});

test('an anchored job whose signed price lapsed stops before funding', async () => {
  const c = chain();
  c.setAllowance(PRICE);
  const create = await next(c, { quote: anchored() });
  if (create.state !== 'call') return assert.fail(JSON.stringify(create));
  c.apply(create.call);
  for (const expected of ['register', 'budget']) {
    const step = await next(c, { jobId: 57_301n });
    assert.ok(step.state === 'call' && step.step === expected, JSON.stringify(step));
    if (step.state === 'call') c.apply(step.call);
  }
  const late = await next(c, { jobId: 57_301n, now: T + 11 * 60_000 });
  assert.equal(late.state, 'stopped');
});

test('the approval is for exactly the price, and an older allowance is cleared first', async () => {
  const c = chain();
  const first = await next(c);
  assert.equal(first.state === 'call' && first.step, 'approve');
  if (first.state !== 'call') return;
  assert.equal(decodeFunctionData({ abi: erc20Abi, data: first.call.data }).args[1], PRICE, 'never unlimited');

  c.setAllowance(1n);
  const reset = await next(c);
  assert.ok(reset.state === 'call' && reset.step === 'approve');
  if (reset.state !== 'call') return;
  assert.equal(decodeFunctionData({ abi: erc20Abi, data: reset.call.data }).args[1], 0n);
  assert.match(reset.expect, /to zero/);
});

test('a wallet without the price is told so, and nothing is offered', async () => {
  const c = chain();
  c.setBalance(PRICE - 1n);
  const step = await next(c);
  assert.equal(step.state, 'stopped');
  assert.match(step.state === 'stopped' ? step.reason : '', /holds less than 0\.05 USDT/);
});

test('a changed price, brief or token stops before the job is created', async () => {
  const c = chain();
  c.setAllowance(PRICE);
  for (const [label, fresh] of [
    ['price', quote({ amountRaw: (PRICE * 2n).toString() })],
    ['brief', quote({ task: 'Something else entirely, signed instead.' })],
    ['token', quote({ currency: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' })],
  ] as const) {
    const step = await next(c, { quote: fresh });
    assert.equal(step.state, 'stopped', label);
  }
  const refused = await next(c, { quote: { error: 'The agent declined.' } });
  assert.deepEqual(refused, { state: 'stopped', jobId: null, reason: 'The agent declined.' });
});

test('a price that lapses before funding stops at the fund step, with the job unfunded', async () => {
  const c = chain();
  c.setAllowance(PRICE);
  const create = await next(c);
  assert.ok(create.state === 'call' && create.step === 'create');
  if (create.state !== 'call') return;
  c.apply(create.call);
  const jobId = 57_301n;
  for (const step of ['register', 'budget']) {
    const call = await next(c, { jobId });
    assert.ok(call.state === 'call' && call.step === step);
    if (call.state === 'call') c.apply(call.call);
  }
  const late = await next(c, { jobId, now: T + 11 * 60_000 });
  assert.equal(late.state, 'stopped');
  assert.match(late.state === 'stopped' ? late.reason : '', /has expired.*Nothing was funded/);
  assert.equal(c.jobs.get(jobId)!.status, 0);
});

test('from the create call on, each call says when the job must be funded by', async () => {
  const c = chain();
  const approve = await next(c);
  assert.ok(approve.state === 'call' && approve.step === 'approve');
  assert.equal(approve.state === 'call' && approve.fundBy, undefined, 'before the job, no price is signed yet');
  if (approve.state === 'call') c.apply(approve.call);

  // The signed price holds 10 minutes; the fund step refuses in its last one.
  const fundBy = new Date(T + 9 * 60_000).toISOString();
  const create = await next(c);
  assert.ok(create.state === 'call' && create.step === 'create');
  if (create.state !== 'call') return;
  assert.equal(create.fundBy, fundBy);
  c.apply(create.call);
  for (const expected of ['register', 'budget', 'fund']) {
    const step = await next(c, { jobId: 57_301n });
    assert.ok(step.state === 'call' && step.step === expected, JSON.stringify(step));
    if (step.state !== 'call') return;
    assert.equal(step.fundBy, fundBy, `${expected} repeats it`);
    c.apply(step.call);
  }
});

test('once the price has lapsed, no further approval is asked for a job that cannot be funded', async () => {
  const c = chain();
  c.setAllowance(PRICE);
  const create = await next(c);
  if (create.state !== 'call') return assert.fail(JSON.stringify(create));
  c.apply(create.call);
  const late = await next(c, { jobId: 57_301n, now: T + 11 * 60_000 });
  assert.equal(late.state, 'stopped', 'not register, then budget, for nothing');
  assert.match(late.state === 'stopped' ? late.reason : '', /Nothing was funded: the job is open and holds no money/);
});

test('a job that is not this hire’s is refused by id, and passed over when searching', async () => {
  const c = chain();
  c.setAllowance(PRICE);
  const create = await next(c);
  if (create.state !== 'call') return assert.fail('expected a call');
  // Someone else's job lands first, then this wallet's.
  c.apply(create.call, '0x00000000000000000000000000000000000000Aa');
  c.apply(create.call);
  const found = await next(c, { searchFrom: BigInt(create.searchFrom!) });
  assert.equal(found.state === 'call' && found.jobId, '57302', 'the wallet’s own job, not the first one created');
  const wrong = await next(c, { jobId: 57_301n });
  assert.equal(wrong.state, 'stopped');
  const otherBrief = await next(c, { jobId: 57_302n, terms: terms({ task: 'A different brief.' }) });
  assert.equal(otherBrief.state, 'stopped');
});

test('a hire prepared for another wallet, or already funded, offers nothing', async () => {
  const c = chain();
  assert.equal((await next(c, { terms: terms({ owner: '0x00000000000000000000000000000000000000bB' }) })).state, 'stopped');
  assert.deepEqual(await next(c, { terms: terms({ jobId: '57299' }) }), { state: 'funded', jobId: '57299' });
});
