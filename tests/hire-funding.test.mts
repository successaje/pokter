import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getAddress } from 'viem';

import { confirmJobToken } from '../src/lib/erc8183/hire-calls';
import { planCommission } from '../src/lib/hire/commission-plan';
import { fundedJobRecord } from '../src/lib/hire/funded-job';
import { fundingJournal, reconcileAttempt, UNSEEN_GRACE_MS, type AttemptChainReader, type FundingAttempt, type KeyValue } from '../src/lib/hire/funding-journal';
import { paymentCopy } from '../src/lib/hire/payment-copy';
import { HIRE_PATHS, hireSupportMatrix, pathFundsToken } from '../src/lib/network/hire-paths';
import { enabledHireTokens, hireTokenAt } from '../src/lib/network/tokens';

/*
 * The paths a buyer actually takes after pressing "Fund escrow": what the
 * final screen says, which wallet may fund which money, and what happens when
 * funding does not end cleanly — a token read that fails after the money
 * moved, a receipt that never comes, a reload, a second click.
 */

const U97 = getAddress('0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565');
const USDT97 = getAddress('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
const USDT56 = getAddress('0x55d398326f99059fF775485246999027B3197955');
const ON = enabledHireTokens(`97:${USDT97},56:${USDT56}`);
const BUYER = getAddress('0xdAb12cf15F4385188bE62bda9F00877AF4C1b32f');
const PROVIDER = getAddress('0x93847647d7eb72a69E162117df6a8697dF53EDda');
const COMMERCE = getAddress('0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE');
const SIGNED = { currency: USDT97, amountRaw: '10000000000000000' }; // 0.01 USDT

/* ---------- planning: one shared flow, refused by path ---------- */

test('a signed USDT price plans exactly the signed amount in USDT, one transaction at a time', () => {
  const plan = planCommission({ escrowChainId: 97, walletMode: 'external', quote: SIGNED, budgetU: 5, agentName: 'Pokter Evidence', tokens: ON });
  assert.ok(plan.ok);
  assert.equal(plan.token?.address, USDT97);
  assert.equal(plan.amountRaw, 10_000_000_000_000_000n, 'the signed amount, not the 5 $U budget');
  assert.equal(plan.amountLabel, '0.01 USDT');
  assert.equal(plan.signedAmount, true);
  assert.equal(plan.path, 'browser-wallet');
  assert.equal(plan.atomicAllowed, false, 'the batch path is off for other tokens until it is tested');
});

test('a $U hire plans as it always has: the budget, any wallet, batching allowed', () => {
  for (const walletMode of ['external', 'passkey'] as const) {
    const plan = planCommission({ escrowChainId: 97, walletMode, quote: { currency: U97, amountRaw: '1' }, budgetU: 0.1, agentName: 'A', tokens: ON });
    assert.ok(plan.ok);
    assert.equal(plan.token, null);
    assert.equal(plan.amountRaw, 100_000_000_000_000_000n, 'the budget, as before — not the price');
    assert.equal(plan.amountLabel, '0.1 $U');
    assert.equal(plan.atomicAllowed, true);
  }
});

test('the passkey wallet refuses a USDT hire by name, before anything is asked', () => {
  const plan = planCommission({ escrowChainId: 97, walletMode: 'passkey', quote: SIGNED, budgetU: 5, agentName: 'Pokter Evidence', tokens: ON });
  assert.equal(plan.ok, false);
  assert.equal(!plan.ok && plan.code, 'wallet-cannot-fund-token');
  assert.match(!plan.ok ? plan.message : '', /priced this in USDT, and the passkey wallet funds \$U only\. Nothing was sent/);
});

test('a token that is not turned on, or a signed-token hire with no quote, is refused rather than funded in $U', () => {
  const off = planCommission({ escrowChainId: 97, walletMode: 'external', quote: SIGNED, budgetU: 5, agentName: 'A', tokens: enabledHireTokens('') });
  assert.equal(!off.ok && off.code, 'token-not-offered');
  const unverified = planCommission({ escrowChainId: 56, walletMode: 'external', quote: { currency: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d', amountRaw: '1' }, budgetU: 5, agentName: 'A', tokens: ON });
  assert.equal(!unverified.ok && unverified.code, 'token-not-offered', 'USD1 is not verified, so it is not available at all');
});

test('the support table: which paths fund which token', () => {
  const usdt = hireTokenAt(97, USDT97, ON)!;
  assert.deepEqual(
    Object.fromEntries((Object.keys(HIRE_PATHS) as Array<keyof typeof HIRE_PATHS>).map((p) => [p, pathFundsToken(p, usdt)])),
    { 'browser-wallet': true, 'browser-wallet-batch': false, 'passkey-wallet': false, 'server-hire': true, 'prepared-hire': true, 'requests-board': false },
  );
  assert.ok(Object.keys(HIRE_PATHS).every((p) => pathFundsToken(p as keyof typeof HIRE_PATHS, null)), '$U on every path');
  assert.deepEqual(hireSupportMatrix(97, ON).map((r) => r.symbol), ['U', 'USDT']);
  assert.deepEqual(hireSupportMatrix(97, enabledHireTokens('')).map((r) => r.symbol), ['U'], 'nothing else listed while off');
});

/* ---------- the final payment screen ---------- */

test('the final payment screen names the signed USDT amount everywhere it names money', () => {
  const plan = planCommission({ escrowChainId: 56, walletMode: 'external', quote: { currency: USDT56, amountRaw: '1000000000000000000' }, budgetU: 0.1, agentName: 'IVL Rebalancer', tokens: ON });
  assert.ok(plan.ok);
  const copy = paymentCopy(plan, { networkLabel: 'BNB Chain', testnet: false, walletMode: 'external', balanceRaw: 250_000_000_000_000_000n, swapHasNoPool: false, nativeSymbol: 'BNB' });
  assert.equal(copy.amountLabel, '1 USDT');
  assert.equal(copy.buttonLabel, 'Fund escrow · 1 USDT');
  assert.equal(copy.balanceLabel, 'USDT to pay with');
  assert.equal(copy.balanceValue, '0.25');
  assert.match(copy.shortNote ?? '', /Short of the signed price\. Pokter does not swap into USDT/);
  assert.equal(copy.topUp, 'add-token');
  assert.match(copy.connectNote, /paid in real USDT on BNB Chain/);
  for (const text of Object.values(copy)) assert.ok(!String(text).includes('$U'), `no $U on a USDT payment screen: ${text}`);
});

test('the $U payment screen reads exactly as it did', () => {
  const plan = planCommission({ escrowChainId: 97, walletMode: 'passkey', quote: null, budgetU: 0.1, agentName: 'A', tokens: ON });
  assert.ok(plan.ok);
  const copy = paymentCopy(plan, { networkLabel: 'BNB Testnet', testnet: true, walletMode: 'passkey', balanceRaw: 0n, swapHasNoPool: false, nativeSymbol: 'tBNB' });
  assert.equal(copy.amountLabel, '0.1 $U');
  assert.equal(copy.buttonLabel, 'Fund escrow · 0.1 $U');
  assert.equal(copy.balanceLabel, '$U to pay with');
  assert.equal(copy.shortNote, 'Short. Pokter will swap tBNB for the difference if you hold enough.');
  assert.equal(copy.connectNote, 'A passkey wallet takes about ten seconds to make, and needs no extension.');
});

test('the hire page renders the payment and success screens from the plan and the job, not from a $U literal', () => {
  const flow = readFileSync('src/features/hire/HireFlow.tsx', 'utf8');
  assert.ok(!/Pay <strong[^>]*>\{hire\.budget\} \$U/.test(flow), 'the old "Pay {budget} $U" is gone');
  assert.ok(!flow.includes('Fund escrow · {hire.budget} $U'), 'the old button label is gone');
  assert.match(flow, /Pay <strong className="t-readout">\{pay\?\.amountLabel/);
  assert.match(flow, /\{pay\?\.buttonLabel/);
  assert.match(flow, /\{jobAmountLabel\(job\)\} is in escrow/);
  assert.ok(!flow.includes('formatUnits(BigInt(job.budgetRaw), 18)} $U'), 'the success screen reads the job’s own token');
  assert.match(flow, /Boolean\(hire\.pendingAttempt\)/, 'funding is blocked while an attempt is pending');
});

/* ---------- token propagation through the hire hook ---------- */

test('the hire hook plans from the signed quote it funds, and records the token the escrow confirmed', () => {
  const hook = readFileSync('src/lib/hire/useHire.ts', 'utf8');
  assert.match(hook, /quote: \{ currency: signedQuote\.intent\.currency, amountRaw: signedQuote\.intent\.amountRaw \}/);
  assert.match(hook, /if \(!signedPlan\.ok\) throw new HireFailure\(signedPlan\.message, 'payment', signedPlan\.code\)/);
  assert.match(hook, /budgetRaw: outcome\.budgetRaw,\s*paymentToken: outcome\.paymentToken,\s*tokenConfirmed: outcome\.tokenConfirmed/);
  const wallet = readFileSync('src/lib/wallet/external.ts', 'utf8');
  assert.match(wallet, /if \(!tokenHire && await supportsAtomicBatch\(account, chainId\)\)/, 'no batch for another token');
  assert.match(wallet, /report\(\{ step, jobId, sentHash: hash \}\);\s*const receipt = await read\.waitForTransactionReceipt/, 'the hash is reported before waiting');
});

test('a funded hire records the confirmed token; one whose token read failed is recorded with the token unknown', () => {
  const base = { jobId: 1675n, chainId: 97, agent: { chainId: 97, tokenId: '2599', name: 'Pokter Evidence' }, provider: PROVIDER, task: 't', budgetRaw: 10_000_000_000_000_000n, paymentToken: USDT97, expiredAt: 1_800_000_000n, hireTxHash: null, at: '2026-10-26T00:00:00.000Z' };
  assert.equal(fundedJobRecord({ ...base, tokenConfirmed: true }).paymentToken, USDT97);
  const unread = fundedJobRecord({ ...base, tokenConfirmed: false });
  assert.equal(unread.paymentToken, null, 'unknown, never filled in from the plan');
  assert.equal(unread.status, 'FUNDED', 'and still recorded as funded, so nothing invites a second payment');
  assert.equal(unread.budgetRaw, '10000000000000000');
});

test('funded but the token read fails: retried, then "unread" — not an error; a different token throws', async () => {
  let calls = 0;
  const failing = { readContract: async () => { calls += 1; throw new Error('rpc down'); } };
  assert.equal(await confirmJobToken(failing as never, COMMERCE, 1n, USDT97, { attempts: 3, sleep: async () => {} }), 'unread');
  assert.equal(calls, 3, 'retried');
  let n = 0;
  const flaky = { readContract: async () => { n += 1; if (n < 3) throw new Error('rpc'); return USDT97.toLowerCase(); } };
  assert.equal(await confirmJobToken(flaky as never, COMMERCE, 1n, USDT97, { attempts: 3, sleep: async () => {} }), 'confirmed');
  const wrong = { readContract: async () => U97 };
  await assert.rejects(confirmJobToken(wrong as never, COMMERCE, 1n, USDT97, { sleep: async () => {} }), /FUNDED_JOB_TOKEN_VERIFICATION_FAILED/);
});

/* ---------- the journal: reload, repeated clicks, ambiguous outcomes ---------- */

function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const START = '2026-10-26T10:00:00.000Z';
const attempt = (over: Partial<FundingAttempt> = {}) => ({
  wallet: BUYER, chainId: 97, provider: PROVIDER, agent: { chainId: 97, tokenId: '2599', name: 'Pokter Evidence' },
  task: 't', description: 'desc', token: USDT97, amountRaw: '10000000000000000', expiredAt: null, startedAt: START, predictedJobId: '100', ...over,
});

test('repeated clicks: a second attempt from the same wallet is refused while the first is open', () => {
  const journal = fundingJournal(memory());
  assert.equal(journal.begin(attempt()).ok, true);
  const second = journal.begin(attempt({ startedAt: '2026-10-26T10:00:01.000Z' }));
  assert.equal(second.ok, false);
  assert.equal(!second.ok && second.blocking.predictedJobId, '100');
  /* Another wallet, or the same wallet on another chain, is its own attempt. */
  assert.equal(journal.begin(attempt({ wallet: PROVIDER })).ok, true);
  assert.equal(journal.begin(attempt({ chainId: 56 })).ok, true);
});

test('reload: identifiers noted as they arrive survive a new page, which is still blocked', () => {
  const kv = memory();
  const first = fundingJournal(kv);
  first.begin(attempt());
  first.note(BUYER, 97, { txHash: '0xaa' });
  first.note(BUYER, 97, { txHash: '0xaa' });
  first.note(BUYER, 97, { jobId: '101', txHash: '0xbb' });
  first.note(BUYER, 97, { callsId: 'batch-1' });
  const reloaded = fundingJournal(kv);
  const open = reloaded.read(BUYER, 97)!;
  assert.deepEqual(open.txHashes, ['0xaa', '0xbb'], 'each hash once, in order');
  assert.equal(open.jobId, '101');
  assert.equal(open.callsId, 'batch-1');
  assert.equal(open.predictedJobId, '100', 'nothing known is erased');
  assert.equal(reloaded.begin(attempt()).ok, false, 'the reloaded page cannot start a second hire');
  reloaded.close(BUYER, 97);
  assert.equal(reloaded.begin(attempt()).ok, true);
});

function chain(over: Partial<AttemptChainReader> & { jobs?: Record<string, { client: string; provider: string; budget: bigint; description: string; statusName: string }> } = {}): AttemptChainReader {
  return {
    receipt: over.receipt ?? (async () => null),
    calls: over.calls,
    job: over.job ?? (async (id) => over.jobs?.[id.toString()] ?? null),
    jobIdFrom: over.jobIdFrom ?? ((logs) => (logs.length ? BigInt(String(logs[0])) : null)),
  };
}
const funded = { client: BUYER, provider: PROVIDER, budget: 10_000_000_000_000_000n, description: 'desc', statusName: 'FUNDED' };
const NOW = Date.parse(START) + 60_000;

test('receipt timeout: the hash was kept, the receipt arrives later, and the funded job is recovered — not re-funded', async () => {
  const pending = { ...attempt(), state: 'pending' as const, updatedAt: START, jobId: null, callsId: null, txHashes: ['0xcreate', '0xfund'] };
  const still = await reconcileAttempt(pending, chain(), NOW);
  assert.equal(still.outcome, 'pending', 'no receipt yet: pending, never "failed"');
  const later = await reconcileAttempt(pending, chain({ receipt: async (h) => ({ status: 'success', logs: h === '0xcreate' ? ['103'] : [] }), jobs: { '103': funded } }), NOW);
  assert.deepEqual(later, { outcome: 'funded', jobId: '103' });
});

test('a lost batch reply: the batch id finds the job, or the predicted window does', async () => {
  const batch = { ...attempt(), state: 'pending' as const, updatedAt: START, jobId: null, callsId: 'b1', txHashes: [] };
  assert.deepEqual(await reconcileAttempt(batch, chain({ calls: async () => ({ status: 'success', logs: ['104'] }), jobs: { '104': funded } }), NOW), { outcome: 'funded', jobId: '104' });
  assert.equal((await reconcileAttempt(batch, chain({ calls: async () => ({ status: 'pending', logs: [] }) }), NOW)).outcome, 'pending');
  /* Ids 100–101 taken by other buyers; ours landed at 102. */
  const other = { ...funded, client: PROVIDER };
  assert.deepEqual(await reconcileAttempt({ ...batch, callsId: null }, chain({ jobs: { '100': other, '101': other, '102': funded } }), NOW), { outcome: 'funded', jobId: '102' });
});

test('only a definite answer closes an attempt; an unreadable escrow keeps it pending', async () => {
  const sent = { ...attempt(), state: 'pending' as const, updatedAt: START, jobId: null, callsId: null, txHashes: ['0xc'] };
  assert.equal((await reconcileAttempt(sent, chain({ job: async () => { throw new Error('rpc'); } }), NOW)).outcome, 'pending');
  /* Created, never funded, and nothing in flight: nothing was taken. */
  const created = await reconcileAttempt(sent, chain({ receipt: async () => ({ status: 'success', logs: ['105'] }), jobs: { '105': { ...funded, statusName: 'OPEN' } } }), NOW);
  assert.equal(created.outcome, 'not-funded');
  /* A fund transaction still unmined keeps it pending. */
  const inFlight = await reconcileAttempt({ ...sent, txHashes: ['0xc', '0xf'] }, chain({ receipt: async (h) => (h === '0xc' ? { status: 'success', logs: ['105'] } : null), jobs: { '105': { ...funded, statusName: 'OPEN' } } }), NOW);
  assert.equal(inFlight.outcome, 'pending');
  /* Terms differ: shown, not closed. */
  assert.equal((await reconcileAttempt(sent, chain({ receipt: async () => ({ status: 'success', logs: ['106'] }), jobs: { '106': { ...funded, budget: 1n } } }), NOW)).outcome, 'mismatch');
  /* The wallet never returned anything: only after the grace period, and only with no matching job, is it closed. */
  const silent = { ...attempt(), state: 'pending' as const, updatedAt: START, jobId: null, callsId: null, txHashes: [] };
  assert.equal((await reconcileAttempt(silent, chain(), NOW)).outcome, 'pending');
  assert.equal((await reconcileAttempt(silent, chain(), Date.parse(START) + UNSEEN_GRACE_MS + 1)).outcome, 'not-funded');
});
