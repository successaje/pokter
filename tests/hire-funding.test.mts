import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getAddress } from 'viem';

import { confirmJobToken } from '../src/lib/erc8183/hire-calls';
import { planCommission } from '../src/lib/hire/commission-plan';
import { fundedJobRecord } from '../src/lib/hire/funded-job';
import { AttemptOwnershipLost, fundingCoordinator, paymentImpossible, reconcileAttempt, type AttemptChainReader, type FundingAttempt, type KeyValue, type LockManagerLike } from '../src/lib/hire/funding-journal';
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
    { 'browser-wallet': true, 'browser-wallet-batch': false, 'passkey-wallet': false, 'server-hire': true, 'prepared-hire': true, 'requests-board': true },
  );
  assert.ok(Object.keys(HIRE_PATHS).every((p) => pathFundsToken(p as keyof typeof HIRE_PATHS, null)), '$U on every path');
  assert.deepEqual(hireSupportMatrix(97, ON).map((r) => r.symbol), ['U', 'USDT']);
  assert.deepEqual(hireSupportMatrix(97, enabledHireTokens('')).map((r) => r.symbol), ['U'], 'nothing else listed while off');
});

/* ---------- the final payment screen ---------- */

test('the final payment screen names the signed Binance-Peg USDT amount everywhere it names money, never as plain USDT', () => {
  const plan = planCommission({ escrowChainId: 56, walletMode: 'external', quote: { currency: USDT56, amountRaw: '1000000000000000000' }, budgetU: 0.1, agentName: 'IVL Rebalancer', tokens: ON });
  assert.ok(plan.ok);
  const copy = paymentCopy(plan, { networkLabel: 'BNB Chain', testnet: false, walletMode: 'external', balanceRaw: 250_000_000_000_000_000n, swapHasNoPool: false, nativeSymbol: 'BNB' });
  assert.equal(copy.amountLabel, '1 Binance-Peg USDT');
  assert.equal(copy.buttonLabel, 'Fund escrow · 1 Binance-Peg USDT');
  assert.equal(copy.balanceLabel, 'Binance-Peg USDT to pay with');
  assert.equal(copy.balanceValue, '0.25');
  assert.match(copy.shortNote ?? '', /Short of the signed price\. Pokter does not swap into Binance-Peg USDT/);
  assert.equal(copy.topUp, 'add-token');
  assert.match(copy.connectNote, /paid in real Binance-Peg USDT on BNB Chain/);
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
  assert.match(flow, /const canFund = [^\n]*&& !hire\.pendingAttempt;/, 'funding is blocked while an attempt is pending');
  assert.match(flow, /disabled=\{!canFund\}/);
});

/* ---------- token propagation through the hire hook ---------- */

test('the hire hook plans from the signed quote it funds, and records the token the escrow confirmed', () => {
  const hook = readFileSync('src/lib/hire/useHire.ts', 'utf8');
  assert.match(hook, /quote: \{ currency: signedQuote\.intent\.currency, amountRaw: signedQuote\.intent\.amountRaw \}/);
  assert.match(hook, /if \(!signedPlan\.ok\) throw new HireFailure\(signedPlan\.message, 'payment', signedPlan\.code\)/);
  assert.match(hook, /budgetRaw: outcome\.budgetRaw,\s*paymentToken: outcome\.paymentToken,\s*tokenConfirmed: outcome\.tokenConfirmed/);
  const wallet = readFileSync('src/lib/wallet/external.ts', 'utf8');
  assert.match(wallet, /if \(!tokenHire && await supportsAtomicBatch\(account, chainId\)\)/, 'no batch for another token');
  assert.match(wallet, /report\(\{ step, jobId, sentHash: hash \}\);\s*(?:\/\*[^]*?\*\/\s*)?const confirmed = await raceWithChain\(read\.waitForTransactionReceipt\(\{ hash, onReplaced/, 'the hash is reported before waiting');
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

/* ---------- the journal: ownership across tabs, reload, ambiguous outcomes ---------- */

/*
 * Two tabs of one browser share local storage and the Web Locks namespace.
 * These stand-ins share both, so the races below run in a fixed order.
 */
function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
function locks(): LockManagerLike & { held: Set<string> } {
  const held = new Set<string>();
  return {
    held,
    async request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}
const START = '2026-10-26T10:00:00.000Z';
const begin = (over: Partial<FundingAttempt> = {}) => ({
  wallet: BUYER, chainId: 97, provider: PROVIDER, agent: { chainId: 97, tokenId: '2599', name: 'Pokter Evidence' },
  /* The deadline the calls encode, recorded before any money-moving prompt, as the drivers do. */
  task: 't', description: 'desc', token: USDT97, amountRaw: '10000000000000000', startedAt: START, predictedJobId: '100', fundableUntil: 9_000_000_000, ...over,
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
/* Every hash mined; the creation receipt names job 105. */
const allMined = (jobStatus: string) => chain({ receipt: async (h) => ({ status: 'success', logs: h === '0xcreate' ? ['105'] : [] }), jobs: { '105': { ...funded, statusName: jobStatus } } });

test('two tabs: B cannot clear A’s attempt or start a duplicate while A waits at the fund prompt; A then completes', async () => {
  const kv = memory();
  const lm = locks();
  const tabA = fundingCoordinator(kv, lm, 'A');
  const tabB = fundingCoordinator(kv, lm, 'B');
  const atFundPrompt = gate();
  const resumeA = gate();
  let aFunded = false;

  const a = tabA.run(begin(), async (session) => {
    session.note({ fundableUntil: 2_000 });
    session.beforePrompt('creating');
    session.note({ txHash: '0xcreate', jobId: '105' });
    session.beforePrompt('registering');
    session.note({ txHash: '0xregister' });
    session.beforePrompt('budgeting');
    session.note({ txHash: '0xbudget' });
    session.beforePrompt('approving');
    session.note({ txHash: '0xapprove' });
    atFundPrompt.open();
    await resumeA.opened; // A sits at the wallet's approval/fund prompt
    session.beforePrompt('funding'); // still the owner
    session.note({ txHash: '0xfund' });
    aFunded = true;
    session.close();
    return 'funded';
  });
  await atFundPrompt.opened;

  /* B opens: the job is OPEN and every recorded transaction is mined. */
  const snapshot = tabB.read(BUYER, 97)!;
  const verdict = await reconcileAttempt(snapshot, allMined('OPEN'));
  assert.equal(verdict.outcome, 'not-funded', 'the chain alone cannot tell an active attempt from a dead one');
  assert.equal(await tabB.settle(snapshot, verdict, 1_000), 'busy', 'but B cannot close what A still owns');
  assert.equal(tabB.read(BUYER, 97)?.attemptId, snapshot.attemptId, 'A’s record is untouched');
  const duplicate = await tabB.run(begin({ startedAt: '2026-10-26T10:01:00.000Z' }), async () => assert.fail('B must not drive a second hire'));
  assert.deepEqual(duplicate, { ok: false, reason: 'in-progress-elsewhere' });

  resumeA.open();
  assert.deepEqual(await a, { ok: true, value: 'funded' });
  assert.equal(aFunded, true, 'A completed the payment it was waiting on');
  assert.equal(tabB.read(BUYER, 97), null, 'and closed its own attempt');
});

test('simultaneous starts from two tabs: exactly one begins, one record exists', async () => {
  const kv = memory();
  const lm = locks();
  const hold = gate();
  const results = await Promise.all([
    fundingCoordinator(kv, lm, 'A').run(begin(), async () => { await hold.opened; return 'A'; }),
    fundingCoordinator(kv, lm, 'B').run(begin(), async () => 'B'),
  ].map(async (p, i) => { if (i === 1) hold.open(); return p; }));
  const began = results.filter((r) => r.ok);
  assert.equal(began.length, 1);
  assert.deepEqual(results.filter((r) => !r.ok), [{ ok: false, reason: 'in-progress-elsewhere' }]);
  assert.equal([...kv.data.keys()].filter((k) => k.startsWith('pokter:funding-attempt:')).length, 1, 'one record, the winner’s');
  assert.equal(fundingCoordinator(kv, lm, 'C').read(BUYER, 97)?.ownerTab, 'A');
});

test('a stale reconciliation cannot delete a newer attempt, or a changed one', async () => {
  const kv = memory();
  const lm = locks();
  const A = fundingCoordinator(kv, lm, 'A');
  const B = fundingCoordinator(kv, lm, 'B');
  /* Attempt X ends unclear: pending, lock released. B reads it. */
  await A.run(begin(), async (session) => { session.beforePrompt('funding'); session.note({ txHash: '0xx' }); session.leavePending(); return null; });
  const staleX = B.read(BUYER, 97)!;
  /* Meanwhile X is settled as funded elsewhere, and a new attempt Y begins and ends pending. */
  assert.equal(await A.settle(staleX, { outcome: 'funded', jobId: '105' }, 1_000), 'closed-funded');
  /* A new hire: a fresh quote, so a new description (the funded one cannot be paid again). */
  await A.run(begin({ startedAt: '2026-10-26T10:05:00.000Z', description: 'desc, a fresh quote' }), async (session) => { session.beforePrompt('approving'); session.leavePending(); return null; });
  const y = B.read(BUYER, 97)!;
  assert.notEqual(y.attemptId, staleX.attemptId);
  /* B's result for X arrives late. */
  assert.equal(await B.settle(staleX, { outcome: 'not-funded', jobId: null, detail: '' }, 1_000), 'stale');
  assert.equal(B.read(BUYER, 97)?.attemptId, y.attemptId, 'Y survives');
  /* A snapshot of Y taken before Y changed is stale too. */
  const kv2 = memory();
  const C = fundingCoordinator(kv2, locks(), 'C');
  await C.run(begin(), async (session) => { session.beforePrompt('funding'); session.leavePending(); return null; });
  const before = C.read(BUYER, 97)!;
  kv2.setItem(`pokter:funding-attempt:97:${BUYER.toLowerCase()}`, JSON.stringify({ ...before, txHashes: ['0xlate'], updatedAt: '2026-10-26T11:00:00.000Z' }));
  assert.equal(await C.settle(before, { outcome: 'not-funded', jobId: null, detail: '' }, 9_999_999_999), 'stale');
});

test('abandoned attempts: closed only when no payment can follow, never on a timeout', async () => {
  assert.equal(paymentImpossible({ prompt: null, fundableUntil: null }, 0), true, 'no prompt ever issued');
  assert.equal(paymentImpossible({ prompt: 'approving', fundableUntil: null }, 0), true, 'an approval alone moves no money');
  assert.equal(paymentImpossible({ prompt: 'funding', fundableUntil: 2_000 }, 1_999), false, 'a fund prompt may still be open');
  assert.equal(paymentImpossible({ prompt: 'funding', fundableUntil: 2_000 }, 2_001), true, 'past the encoded expiry the escrow refuses it');
  assert.equal(paymentImpossible({ prompt: 'batch', fundableUntil: null }, 9_999_999_999), false, 'time alone never proves anything: an unknown deadline is never past');

  const kv = memory();
  const lm = locks();
  const A = fundingCoordinator(kv, lm, 'A');
  /* A's tab dies at the fund prompt: the lock is gone, the record stays. */
  await A.run(begin(), async (session) => { session.note({ fundableUntil: 2_000 }); session.beforePrompt('creating'); session.note({ txHash: '0xcreate', jobId: '105' }); session.beforePrompt('funding'); session.leavePending(); return null; });
  const B = fundingCoordinator(kv, lm, 'B');
  const snap = B.read(BUYER, 97)!;
  const verdict = await reconcileAttempt(snap, allMined('OPEN'));
  assert.equal(await B.settle(snap, verdict, 1_500), 'kept-may-still-pay');
  assert.ok(B.read(BUYER, 97), 'still blocking new hires');
  assert.equal(await B.settle(B.read(BUYER, 97)!, verdict, 2_001), 'closed-not-funded', 'after the expiry no payment can follow');
  assert.equal(B.read(BUYER, 97), null);
});

test('ownership is checked before every prompt: a lost record stops the flow', async () => {
  const kv = memory();
  const A = fundingCoordinator(kv, locks(), 'A');
  const result = A.run(begin(), async (session) => {
    session.beforePrompt('creating');
    kv.removeItem(`pokter:funding-attempt:97:${BUYER.toLowerCase()}`); // cleared out from under it
    session.beforePrompt('funding');
    return 'should not get here';
  });
  await assert.rejects(result, AttemptOwnershipLost);
});

test('reload: what the owner noted survives, the new page cannot begin, and recovery adopts the funded job', async () => {
  const kv = memory();
  const lm = locks();
  await fundingCoordinator(kv, lm, 'A').run(begin(), async (session) => {
    session.beforePrompt('creating');
    session.note({ txHash: '0xcreate' });
    session.note({ txHash: '0xcreate' });
    session.beforePrompt('funding');
    session.note({ txHash: '0xfund', callsId: 'b1' });
    session.leavePending(); // the page went away mid-funding
    return null;
  });
  const reloaded = fundingCoordinator(kv, lm, 'A-reloaded');
  const open = reloaded.read(BUYER, 97)!;
  assert.deepEqual(open.txHashes, ['0xcreate', '0xfund'], 'each hash once, in order');
  assert.equal(open.callsId, 'b1');
  assert.equal(open.prompt, 'funding');
  const blocked = await reloaded.run(begin(), async () => assert.fail('no second hire'));
  assert.equal(!blocked.ok && blocked.reason, 'open-attempt');
  /* Receipt timeout: the receipts arrive later and name the funded job. */
  const verdict = await reconcileAttempt(open, allMined('FUNDED'));
  assert.deepEqual(verdict, { outcome: 'funded', jobId: '105' });
  let adopted: string | null = null;
  assert.equal(await reloaded.settle(open, verdict, 1_000, async (jobId) => { adopted = jobId; }), 'closed-funded');
  assert.equal(adopted, '105', 'adopted once, under the lock');
  assert.equal(reloaded.read(BUYER, 97), null);
});

test('without Web Locks nothing is closed on another’s behalf', async () => {
  const kv = memory();
  const A = fundingCoordinator(kv, null, 'A');
  await A.run(begin(), async (session) => { session.beforePrompt('approving'); session.leavePending(); return null; });
  const snap = A.read(BUYER, 97)!;
  assert.equal(await A.settle(snap, { outcome: 'not-funded', jobId: null, detail: '' }, 1_000), 'busy');
});

test('reconciliation reads: a lost batch reply, the predicted window, an unreadable escrow, a mismatch', async () => {
  const base = { ...begin(), attemptId: 'x', ownerTab: 'A', updatedAt: START, jobId: null, callsId: null, txHashes: [] as string[], prompt: 'batch' as const, fundableUntil: null, state: 'pending' as const };
  assert.deepEqual(await reconcileAttempt({ ...base, callsId: 'b1' }, chain({ calls: async () => ({ status: 'success', logs: ['104'] }), jobs: { '104': funded } })), { outcome: 'funded', jobId: '104' });
  assert.equal((await reconcileAttempt({ ...base, callsId: 'b1' }, chain({ calls: async () => ({ status: 'pending', logs: [] }) }))).outcome, 'pending');
  const other = { ...funded, client: PROVIDER };
  assert.deepEqual(await reconcileAttempt(base, chain({ jobs: { '100': other, '101': other, '102': funded } })), { outcome: 'funded', jobId: '102' });
  assert.equal((await reconcileAttempt({ ...base, txHashes: ['0xc'] }, chain({ job: async () => { throw new Error('rpc'); } }))).outcome, 'pending');
  assert.equal((await reconcileAttempt({ ...base, txHashes: ['0xc'] }, chain({ receipt: async () => ({ status: 'success', logs: ['106'] }), jobs: { '106': { ...funded, budget: 1n } } }))).outcome, 'mismatch');
  assert.equal((await reconcileAttempt({ ...base, txHashes: ['0xc', '0xf'] }, chain({ receipt: async (h) => (h === '0xc' ? { status: 'success', logs: ['105'] } : null), jobs: { '105': { ...funded, statusName: 'OPEN' } } }))).outcome, 'pending', 'a transaction still unmined');
});

test('recovery records the escrow’s own deadline, not the time it was recovered', () => {
  const hook = readFileSync('src/lib/hire/useHire.ts', 'utf8');
  assert.match(hook, /expiredAt: onchain\.expiredAt,/);
  assert.ok(!/expiredAt: (snapshot|attempt)\.expiredAt \?\? at/.test(hook), 'no fallback to the recovery time');
  const wallet = readFileSync('src/lib/wallet/external.ts', 'utf8');
  assert.match(wallet, /expiredAt: job\.expiredAt \}/, 'the reader returns the on-chain deadline');
  const record = fundedJobRecord({ jobId: 1n, chainId: 97, agent: { chainId: 97, tokenId: '1', name: 'a' }, provider: PROVIDER, task: 't', budgetRaw: 1n, paymentToken: USDT97, tokenConfirmed: true, expiredAt: 1_800_000_000n, hireTxHash: null, at: '2026-10-26T00:00:00.000Z' });
  assert.equal(record.expiredAt, new Date(1_800_000_000 * 1000).toISOString());
});

test('the hire hook drives every attempt as its owner and settles only through the coordinator', () => {
  const hook = readFileSync('src/lib/hire/useHire.ts', 'utf8');
  assert.match(hook, /beforePrompt: \(step\) => \{\s*session\.beforePrompt\(step\);/, 'browser wallet: ownership before every prompt');
  assert.match(hook, /session\.beforePrompt\('batch'\);\s*const outcome = await hireErc8183Agent/, 'passkey: ownership before its one prompt');
  assert.match(hook, /await coordinator\.settle\(snapshot, verdict, chainNow/);
  assert.ok(!/journal\.close|journal\.note|journal\.begin/.test(hook), 'nothing writes the journal outside the coordinator');
  const wallet = readFileSync('src/lib/wallet/external.ts', 'utf8');
  assert.match(wallet, /ask\('batch'\);\s*const sent = await provider\(\)\.request\(\{ method: 'wallet_sendCalls'/);
  assert.match(wallet, /ask\(step as Parameters<typeof ask>\[0\]\);\s*const sending = wallet\.sendTransaction/);
  assert.match(wallet, /input\.beforePrompt\?\.\('swapping'\);\s*await acquireShortfall/);
});
