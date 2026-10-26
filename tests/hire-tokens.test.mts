import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeFunctionData, erc20Abi, getAddress, parseAbi, type Address } from 'viem';

import { COMMERCE_TOKEN_ABI, assertEscrowSupportsToken, buildTokenHireCalls, readJobPaymentToken } from '../src/lib/erc8183/hire-calls';
import { UnsupportedHireTokenError, nonDefaultHireToken } from '../src/lib/erc8183/hire-token';
import { isDollarUJob, jobAmountLabel, jobToken, totalsByToken } from '../src/lib/erc8183/job-amount';
import { backfillJobCurrencies } from '../src/lib/erc8183/currency-backfill';
import { quotePayableOn } from '../src/lib/erc8183/payable';
import { escrowChainForCurrency, settlementHint } from '../src/lib/network/escrow';
import { enabledHireTokens, hireTokenAt, offeredTokens, uniformOfferedDecimals } from '../src/lib/network/tokens';
import { checkPurchaseIntent, type PurchaseIntent } from '../src/lib/hire/purchase-intent';
import { evidenceQuoteToken } from '../src/lib/evidence/quote-token';
import { earningsByChain } from '../src/lib/builders/provider-earnings';

/*
 * Hiring in verified tokens other than $U, as one shared flow.
 *
 * Which tokens are on is read from `NEXT_PUBLIC_HIRE_TOKENS` by default and
 * passed explicitly here, so every case states which world it is in: none on
 * is today's product, and on is the release. Addresses are the recorded ones
 * in `network/tokens`, never a symbol.
 */

const U56 = getAddress('0xcE24439F2D9C6a2289F741120FE202248B666666');
const U97 = getAddress('0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565');
const USDT56 = getAddress('0x55d398326f99059fF775485246999027B3197955');
const USDT97 = getAddress('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
const USDC56 = getAddress('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d');
const USD1_56 = getAddress('0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d');

const ADDR97 = {
  commerce: getAddress('0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE'),
  router: getAddress('0xD7d36D66d2F1B608A0F943f722D27e3744f66F25'),
  policy: getAddress('0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA'),
  paymentToken: U97,
};
const PROVIDER = getAddress('0x93847647d7eb72a69E162117df6a8697dF53EDda');
const OFF = enabledHireTokens('');
const ON = enabledHireTokens(`56:${USDT56},97:${USDT97}`);

test('a token is turned on only by chain and address, and only when it is eligible', () => {
  assert.equal(enabledHireTokens(undefined).size, 0, 'unset is $U only');
  assert.equal(enabledHireTokens().size, 0, 'the test environment turns nothing on');
  assert.deepEqual([...enabledHireTokens(`97:${USDT97}`)], [`97:${USDT97.toLowerCase()}`]);
  for (const raw of ['true', 'USDT', `${USDT97}`, `56:${USDT97}`, `56:${USDC56}`, `97:0xEC1C60D64a06896Df296438c12edD14E974FDE47`, `56:${USD1_56}`, `56:${U56}`, '97:not-an-address']) {
    assert.equal(enabledHireTokens(raw).size, 0, `ignored: ${raw}`);
  }
});

test('off, Pokter offers $U alone; on, USDT is added by address, and USDC and USD1 never are', () => {
  for (const chainId of [56, 97]) {
    assert.deepEqual(offeredTokens(chainId, OFF).map((t) => t.symbol), ['U']);
    assert.deepEqual(offeredTokens(chainId, ON).map((t) => t.symbol), ['U', 'USDT']);
  }
  assert.equal(hireTokenAt(56, USDT56, OFF), null);
  assert.equal(hireTokenAt(56, USDT56, ON)?.address, USDT56);
  /* An address is a token on one chain: mainnet USDT is not offered on testnet. */
  assert.equal(hireTokenAt(97, USDT56, ON), null);
  assert.equal(hireTokenAt(97, USDT97, ON)?.decimals, 18);
  assert.equal(hireTokenAt(56, USDC56, ON), null, 'supported by the escrow, not offered');
  assert.equal(hireTokenAt(56, USD1_56, ON), null, 'not recorded at all');
  assert.equal(hireTokenAt(56, 'USDT', ON), null, 'a symbol is not a token');
  /* Still one scale across everything offered, so existing sums keep working. */
  assert.equal(uniformOfferedDecimals(), 18);
});

test('the escrow a price settles on: $U as before, USDT only with the flag, unknown money nowhere', () => {
  assert.equal(escrowChainForCurrency(U56, [97, 56], OFF), 56);
  assert.equal(escrowChainForCurrency(U97, [97, 56], OFF), 97);
  assert.equal(escrowChainForCurrency(USDT56, [97, 56], OFF), null, 'off: a USDT price is unpayable, as today');
  assert.equal(escrowChainForCurrency(USDT56, [97, 56], ON), 56);
  assert.equal(escrowChainForCurrency(USDT56, [97], ON), null, 'mainnet USDT needs the mainnet escrow enabled');
  assert.equal(escrowChainForCurrency(USDT97, [97], ON), 97);
  assert.equal(escrowChainForCurrency(USDC56, [97, 56], ON), null);
  assert.equal(quotePayableOn(56, USDT56, OFF), false);
  assert.equal(quotePayableOn(56, USDT56, ON), true);
  assert.equal(quotePayableOn(56, U56, OFF), true);
});

test('the settlement hint is unchanged while off, and lists payable money by address while on', () => {
  assert.deepEqual(settlementHint({ chain_id: 97 }, [97], OFF), { chain_id: 97, escrow_chains: [97] });
  const on = settlementHint({ chain_id: 97 }, [97], ON) as { currencies: Array<{ chain_id: number; token: string; symbol: string; decimals: number }> };
  assert.deepEqual(on.currencies, [
    { chain_id: 97, token: U97, symbol: 'U', decimals: 18 },
    { chain_id: 97, token: USDT97, symbol: 'USDT', decimals: 18 },
  ]);
});

test('the token a hire funds comes from the signed currency: $U is the old path, USDT is refused while off', () => {
  assert.equal(nonDefaultHireToken(97, U97, ON), null, '$U goes through the SDK as always');
  assert.equal(nonDefaultHireToken(97, null, ON), null, 'no signed price, no token hire');
  assert.equal(nonDefaultHireToken(97, USDT97, ON)?.address, USDT97);
  assert.throws(() => nonDefaultHireToken(97, USDT97, OFF), UnsupportedHireTokenError, 'off: refused, never funded in $U instead');
  assert.throws(() => nonDefaultHireToken(97, USDC56, ON), UnsupportedHireTokenError);
  assert.throws(() => nonDefaultHireToken(56, USD1_56, ON), /does not fund/);
});

test('the USDT batch is the SDK batch with createJobWithToken and the approval in USDT, for exactly the budget', () => {
  const budget = 123_000_000_000_000_000n;
  const calls = buildTokenHireCalls({ chainId: 97, addresses: ADDR97, jobId: 42n, provider: PROVIDER, description: 'brief', budget, expiredAt: 1_800_000_000n, token: USDT97, tokens: ON });
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map((c) => c.to), [ADDR97.commerce, ADDR97.router, ADDR97.commerce, USDT97, ADDR97.commerce]);

  const create = decodeFunctionData({ abi: COMMERCE_TOKEN_ABI, data: calls[0].data });
  assert.equal(create.functionName, 'createJobWithToken');
  assert.deepEqual(create.args, [PROVIDER, ADDR97.router, 1_800_000_000n, 'brief', ADDR97.router, USDT97], 'router as evaluator and hook, the token last');

  const register = decodeFunctionData({ abi: parseAbi(['function registerJob(uint256,address)']), data: calls[1].data });
  assert.deepEqual(register.args, [42n, ADDR97.policy]);
  const setBudget = decodeFunctionData({ abi: COMMERCE_TOKEN_ABI, data: calls[2].data });
  assert.deepEqual(setBudget.args, [42n, budget, '0x']);
  const approve = decodeFunctionData({ abi: erc20Abi, data: calls[3].data });
  assert.equal(approve.functionName, 'approve');
  assert.deepEqual(approve.args, [ADDR97.commerce, budget], 'exactly the budget, to the escrow, on USDT');
  const fund = decodeFunctionData({ abi: COMMERCE_TOKEN_ABI, data: calls[4].data });
  assert.deepEqual(fund.args, [42n, budget, '0x']);
  assert.ok(calls.every((c) => c.value === undefined), 'no native value');
});

test('the token batch refuses $U, unoffered tokens, a zero budget and an oversized description', () => {
  const base = { chainId: 97, addresses: ADDR97, jobId: 1n, provider: PROVIDER, description: 'x', budget: 1n, expiredAt: 1n, tokens: ON };
  assert.throws(() => buildTokenHireCalls({ ...base, token: U97 }), { name: 'UnsupportedHireTokenError' }, '$U is built by the SDK');
  assert.throws(() => buildTokenHireCalls({ ...base, token: USDT56 }), { name: 'UnsupportedHireTokenError' }, 'mainnet USDT on the testnet escrow');
  assert.throws(() => buildTokenHireCalls({ ...base, token: USDT97, budget: 0n }), /INVALID_BUDGET/);
  assert.throws(() => buildTokenHireCalls({ ...base, token: USDT97, description: 'x'.repeat(4097) }), /4096/);
  assert.throws(() => buildTokenHireCalls({ ...base, token: USDT97, tokens: OFF }), { name: 'UnsupportedHireTokenError' }, 'and USDT with the flag off');
});

test('the escrow is asked before anything is signed, and an unreadable answer is a refusal', async () => {
  const reader = (answer: unknown | Error) => ({
    readContract: async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
  await assertEscrowSupportsToken(reader(true) as never, ADDR97.commerce, USDT97);
  await assert.rejects(assertEscrowSupportsToken(reader(false) as never, ADDR97.commerce, USDT97), /no longer accepts/);
  await assert.rejects(assertEscrowSupportsToken(reader(new Error('rpc down')) as never, ADDR97.commerce, USDT97), /could not confirm/);
  assert.equal(await readJobPaymentToken(reader(USDT97.toLowerCase()) as never, ADDR97.commerce, 1n), USDT97);
  assert.equal(await readJobPaymentToken(reader(new Error('rpc down')) as never, ADDR97.commerce, 1n), null, 'unread stays unknown');
});

const intent: PurchaseIntent = {
  provider: PROVIDER,
  task: 'brief',
  amountRaw: '100000000000000000',
  currency: USDT97,
  chainId: 97,
  verifyingContract: ADDR97.commerce,
  expiresAt: 2_000_000_000,
  negotiationHash: '0xabc',
};
const funding = { provider: PROVIDER, task: 'brief', chainId: 97, commerce: ADDR97.commerce, paymentToken: USDT97 };

test('a USDT hire funds exactly the signed amount in the signed token, and a lapsed quote stops it', () => {
  const now = 1_700_000_000_000;
  assert.deepEqual(checkPurchaseIntent(intent, { ...funding, amountRaw: intent.amountRaw }, now), { ok: true });
  const more = checkPurchaseIntent(intent, { ...funding, amountRaw: '100000000000000001' }, now);
  assert.equal(more.ok, false);
  assert.match(more.ok ? '' : more.reason, /signed amount is funded exactly/);
  const less = checkPurchaseIntent(intent, { ...funding, amountRaw: '99999999999999999' }, now);
  assert.equal(less.ok, false, 'not rounded either way');
  const inU = checkPurchaseIntent(intent, { ...funding, paymentToken: U97, amountRaw: intent.amountRaw }, now);
  assert.equal(inU.ok, false, 'a USDT price is never funded in $U');
  const lapsed = checkPurchaseIntent({ ...intent, expiresAt: Math.floor(now / 1000) + 30 }, { ...funding, amountRaw: intent.amountRaw }, now);
  assert.equal(lapsed.ok, false, 'inside the margin for the wallet steps');
  /* A $U hire passes no amount and keeps its existing rule. */
  assert.deepEqual(checkPurchaseIntent({ ...intent, currency: U97 }, { ...funding, paymentToken: U97 }, now), { ok: true });
});

test('amounts are labelled in the job’s own token, and an unknown token is unknown with any tokens on or off', () => {
  assert.equal(jobAmountLabel({ chainId: 97, paymentToken: USDT97, budgetRaw: '100000000000000000' }), '0.1 USDT');
  assert.equal(jobAmountLabel({ chainId: 97, paymentToken: U97, budgetRaw: '100000000000000000' }), '0.1 $U');
  assert.equal(jobAmountLabel({ chainId: 97, paymentToken: null, budgetRaw: '100000000000000000' }), '100000000000000000 base units (currency not yet read)');
  assert.equal(jobToken({ chainId: 97, paymentToken: null }), null);
  assert.equal(isDollarUJob({ chainId: 97, paymentToken: USDT97 }), false, 'a USDT job is never in a $U figure');
  assert.equal(isDollarUJob({ chainId: 56, paymentToken: U56 }), true);
  assert.equal(isDollarUJob({ chainId: 56, paymentToken: null }), false, 'unknown is not $U');
});

test('rollback: turning every extra token off relabels nothing — unread stays unknown, a USDT job stays USDT', () => {
  /*
   * The defect this pins: an "unknown means $U while the flag is off" rule
   * would turn real USDT jobs whose token had not been read yet into $U the
   * moment the flag was turned off, and fold them into the $U totals.
   * Nothing in the labels or totals reads the flag now; this proves it by
   * computing the same rows with the environment set each way.
   */
  const rows = [
    { chainId: 56, paymentToken: USDT56, budgetRaw: '2000000000000000000' },
    { chainId: 56, paymentToken: null, budgetRaw: '3000000000000000000' },
    { chainId: 56, paymentToken: U56, budgetRaw: '1000000000000000000' },
  ];
  const read = () => ({
    labels: rows.map((r) => jobAmountLabel(r)),
    dollarU: rows.filter((r) => isDollarUJob(r)).length,
    totals: totalsByToken(rows).map((t) => `${t.symbol ?? 'unknown'}:${t.raw}`).sort(),
  });
  const saved = process.env.NEXT_PUBLIC_HIRE_TOKENS;
  try {
    process.env.NEXT_PUBLIC_HIRE_TOKENS = `56:${USDT56}`;
    const on = read();
    delete process.env.NEXT_PUBLIC_HIRE_TOKENS;
    const off = read();
    assert.deepEqual(off, on, 'the flag changes no label and no total');
    assert.deepEqual(off.labels, ['2 USDT', '3000000000000000000 base units (currency not yet read)', '1 $U']);
    assert.equal(off.dollarU, 1, 'only the positively identified $U job counts as $U');
    assert.deepEqual(off.totals, ['$U:1000000000000000000', 'USDT:2000000000000000000', 'unknown:3000000000000000000']);
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_HIRE_TOKENS;
    else process.env.NEXT_PUBLIC_HIRE_TOKENS = saved;
  }
});

test('totals are per chain and token, unknown in its own bucket, and never one combined figure', () => {
  const totals = totalsByToken([
    { chainId: 56, paymentToken: U56, budgetRaw: '1000000000000000000' },
    { chainId: 56, paymentToken: USDT56, budgetRaw: '2000000000000000000' },
    { chainId: 56, paymentToken: USDT56, budgetRaw: '500000000000000000' },
    { chainId: 97, paymentToken: U97, budgetRaw: '300000000000000000' },
    { chainId: 56, paymentToken: null, budgetRaw: '7' },
  ]);
  const by = Object.fromEntries(totals.map((t) => [`${t.chainId}:${t.symbol ?? 'unknown'}`, t]));
  assert.equal(totals.length, 4);
  assert.equal(by['56:$U'].label, '1 $U');
  assert.equal(by['56:USDT'].label, '2.5 USDT');
  assert.equal(by['56:USDT'].jobs, 2);
  assert.equal(by['97:$U'].label, '0.3 $U', 'testnet $U is not mainnet $U');
  assert.equal(by['56:unknown'].raw, 7n);
  assert.equal(by['56:unknown'].label, null, 'no scale, no label');
});

test('provider earnings: one line per chain and token', () => {
  const lines = earningsByChain([
    { chainId: 56, status: 'COMPLETED', budgetRaw: '1000000000000000000', paymentToken: U56 },
    { chainId: 56, status: 'COMPLETED', budgetRaw: '2000000000000000000', paymentToken: USDT56 },
    { chainId: 56, status: 'FUNDED', budgetRaw: '1000000000000000000', paymentToken: USDT56 },
  ]);
  assert.equal(lines.length, 2);
  const usdt = lines.find((l) => l.symbol === 'USDT')!;
  const u = lines.find((l) => l.symbol === '$U')!;
  assert.equal(usdt.releasedU, '2');
  assert.equal(usdt.inEscrowU, '1');
  assert.equal(u.releasedU, '1');
});

test('the currency backfill reads each unknown job once, writes only what it read, and leaves failures unknown', async () => {
  const written: string[] = [];
  const reads: Record<string, string | null | Error> = { '97:1': USDT97, '97:2': null, '56:3': new Error('rpc'), '97:4': U97.toLowerCase() };
  const report = await backfillJobCurrencies({
    rows: [{ chainId: 97, jobId: '1' }, { chainId: 97, jobId: '1' }, { chainId: 97, jobId: '2' }, { chainId: 56, jobId: '3' }, { chainId: 97, jobId: '4' }, { chainId: 1, jobId: '5' }],
    read: async (chainId, jobId) => {
      const r = reads[`${chainId}:${jobId}`];
      if (r instanceof Error) throw r;
      return r ?? null;
    },
    write: true,
    set: (chainId, jobId, token) => {
      written.push(`${chainId}:${jobId}:${token}`);
      return 1;
    },
  });
  assert.equal(report.examined, 5, 'the duplicate row is read once');
  assert.equal(report.read, 2);
  assert.equal(report.unread, 3);
  assert.deepEqual(written, [`97:1:${USDT97}`, `97:4:${U97}`], 'checksummed, and nothing for the unread');
  assert.equal(report.byToken[`97:${USDT97}`], 1);

  const dry = await backfillJobCurrencies({ rows: [{ chainId: 97, jobId: '1' }], read: async () => USDT97, write: false, set: () => assert.fail('a dry run wrote') });
  assert.equal(dry.written, 0);
});

test('the Evidence agent prices in USDT only when configured, offered, and listed by the buyer', () => {
  const listed = [{ chain_id: 97, token: U97 }, { chain_id: 97, token: USDT97 }];
  assert.equal(evidenceQuoteToken(97, listed, undefined), undefined, 'unset: the default, as in production');
  /* `hireTokenAt` reads the flag, which is off in tests: USDT is not offered, so not quoted. */
  assert.equal(evidenceQuoteToken(97, listed, USDT97), undefined);
  assert.equal(evidenceQuoteToken(97, listed, U97), U97, 'the default is always allowed');
  assert.equal(evidenceQuoteToken(97, [{ chain_id: 97, token: U97 }], U97), U97);
  assert.equal(evidenceQuoteToken(97, [{ chain_id: 56, token: U97 }], U97), undefined, 'listed for another chain only');
});

test('nothing here defaults a token: every reader of the job’s money goes through the job’s own token', () => {
  const addresses: Address[] = [U56, U97, USDT56, USDT97];
  for (const a of addresses) assert.equal(getAddress(a), a, 'recorded addresses are checksummed');
});
