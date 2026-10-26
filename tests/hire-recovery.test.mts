import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { encodeFunctionData, getAddress } from 'viem';

import { backfillJobCurrencies } from '../src/lib/erc8183/currency-backfill';
import { COMMERCE_TOKEN_ABI } from '../src/lib/erc8183/hire-calls';
import { amountWithinLimits, budgetLimitsFor } from '../src/lib/hire/budget-limits';
import { planCommission } from '../src/lib/hire/commission-plan';
import { DeadlineNotRecorded, fundingCoordinator, reconcileAttempt, type AttemptChainReader, type FundingAttempt, type KeyValue, type LockManagerLike } from '../src/lib/hire/funding-journal';
import { hasEvidence, publicIdFor, publicView, secretHash, settleRemote } from '../src/lib/hire/remote-attempts';
import { remoteDecision, type PublicAttempt } from '../src/lib/hire/remote-attempt-client';
import { enabledHireTokens } from '../src/lib/network/tokens';
import type { RemoteAttemptRow } from '../src/lib/erc8183/store';

/*
 * Payment recovery as a system: replaced transactions, resuming an attempt's
 * own job, the cross-device record, per-token limits, and the backfill's
 * audit trail.
 */

const BUYER = getAddress('0xdAb12cf15F4385188bE62bda9F00877AF4C1b32f');
const PROVIDER = getAddress('0x93847647d7eb72a69E162117df6a8697dF53EDda');
const USDT56 = getAddress('0x55d398326f99059fF775485246999027B3197955');
const USDT97 = getAddress('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
const ON = enabledHireTokens(`56:${USDT56},97:${USDT97}`);
const funded: { client: string; provider: string; budget: bigint; description: string; statusName: string; expiredAt?: bigint } = { client: BUYER, provider: PROVIDER, budget: 10n, description: 'd', statusName: 'FUNDED' };

const attempt = (over: Partial<FundingAttempt> = {}): FundingAttempt => ({
  attemptId: 'a', ownerTab: 'A', wallet: BUYER, chainId: 97, provider: PROVIDER, agent: { chainId: 97, tokenId: '1', name: 'x' },
  task: 't', description: 'd', token: USDT97, amountRaw: '10', fundableUntil: 2_000, startedAt: '2026-10-26T10:00:00.000Z', updatedAt: '2026-10-26T10:00:00.000Z',
  predictedJobId: '100', jobId: null, callsId: null, txHashes: [], prompt: 'funding', state: 'pending', ...over,
});
const reader = (over: Partial<AttemptChainReader> & { jobs?: Record<string, typeof funded> } = {}): AttemptChainReader => ({
  receipt: over.receipt ?? (async () => null),
  txState: over.txState,
  job: over.job ?? (async (id) => over.jobs?.[id.toString()] ?? null),
  jobIdFrom: over.jobIdFrom ?? ((logs) => (logs.length ? BigInt(String(logs[0])) : null)),
});

test('a replaced transaction is not "in flight": its nonce went to another, and the job reads decide', async () => {
  const a = attempt({ jobId: '105', txHashes: ['0xcreate', '0xfund-original'] });
  const jobs = { '105': { ...funded, statusName: 'OPEN' } };
  const mined = async (h: string) => (h === '0xcreate' ? { status: 'success' as const, logs: ['105'] } : null);
  assert.equal((await reconcileAttempt(a, reader({ receipt: mined, jobs, txState: async () => 'pending' }))).outcome, 'pending', 'still pending: kept');
  assert.equal((await reconcileAttempt(a, reader({ receipt: mined, jobs, txState: async () => 'unknown' }))).outcome, 'pending', 'unknown to the node: kept, conservatively');
  assert.equal((await reconcileAttempt(a, reader({ receipt: mined, jobs, txState: async () => 'replaced' }))).outcome, 'not-funded', 'replaced and the job is OPEN: nothing in flight');
  /* A speed-up that did fund is found by the job read, whatever happened to the original hash. */
  assert.deepEqual(await reconcileAttempt(a, reader({ receipt: mined, jobs: { '105': funded }, txState: async () => 'replaced' })), { outcome: 'funded', jobId: '105' });
});

function memory(): KeyValue { const d = new Map<string, string>(); return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v), removeItem: (k) => void d.delete(k) }; }
function locks(): LockManagerLike { const held = new Set<string>(); return { async request(n, _o, cb) { if (held.has(n)) return cb(null); held.add(n); try { return await cb({}); } finally { held.delete(n); } } }; }

test('resume: an abandoned attempt is taken over to finish its own job; a stale snapshot or a live owner refuses', async () => {
  const kv = memory();
  const lm = locks();
  const A = fundingCoordinator(kv, lm, 'A');
  await A.run({ wallet: BUYER, chainId: 97, provider: PROVIDER, agent: { chainId: 97, tokenId: '1', name: 'x' }, task: 't', description: 'd', token: USDT97, amountRaw: '10', startedAt: '2026-10-26T10:00:00.000Z', predictedJobId: '100', fundableUntil: 9_000_000_000 }, async (s) => {
    s.beforePrompt('creating'); s.note({ txHash: '0xc', jobId: '105' }); s.beforePrompt('approving'); s.leavePending(); return null;
  });
  const B = fundingCoordinator(kv, lm, 'B');
  const snap = B.read(BUYER, 97)!;
  const resumed = await B.resume(snap, async (session) => { session.beforePrompt('funding'); session.note({ txHash: '0xf' }); session.close(); return 'funded-105'; });
  assert.deepEqual(resumed, { ok: true, value: 'funded-105' });
  assert.equal(B.read(BUYER, 97), null, 'closed by the tab that finished it');
  assert.deepEqual(await B.resume(snap, async () => 'x'), { ok: false, reason: 'stale' }, 'a snapshot of a record that is gone');
  /* While another tab owns an attempt, resume is refused like any other start. */
  const hold = (() => { let r!: () => void; const p = new Promise<void>((res) => (r = res)); return { r, p }; })();
  const running = A.run({ wallet: BUYER, chainId: 97, provider: PROVIDER, agent: { chainId: 97, tokenId: '1', name: 'x' }, task: 't', description: 'd, a fresh quote', token: USDT97, amountRaw: '10', startedAt: '2026-10-26T11:00:00.000Z', predictedJobId: '200' }, async () => { await hold.p; return null; });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(await B.resume(B.read(BUYER, 97)!, async () => 'x'), { ok: false, reason: 'in-progress-elsewhere' });
  hold.r();
  await running;
});

const row = (over: Partial<RemoteAttemptRow> = {}): RemoteAttemptRow => ({
  publicId: publicIdFor('secret-0123456789'), secretHash: secretHash('secret-0123456789'), wallet: BUYER.toLowerCase(), chainId: 97, provider: PROVIDER, description: 'd', token: USDT97, amountRaw: '10',
  predictedJobId: '100', jobId: null, callsId: null, txHashes: [], prompt: 'funding', fundableUntil: 2_000, verified: false, state: 'open', closeReason: null, createdAt: '2026-10-26T10:00:00.000Z', updatedAt: '2026-10-26T10:00:00.000Z', ...over,
});

const COMMERCE97 = '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE';
const createInput = (description: string, provider = PROVIDER) => encodeFunctionData({ abi: COMMERCE_TOKEN_ABI, functionName: 'createJobWithToken', args: [provider, PROVIDER, 2_000n, description, PROVIDER, USDT97] });

test('cross-device: only this attempt’s own create transaction makes a record block', async () => {
  const began = Date.parse('2026-10-26T10:00:00.000Z') / 1000;
  const txs: Record<string, { from: string; to: string | null; input: string; timestamp: number | null }> = {
    '0xmine': { from: BUYER, to: COMMERCE97, input: createInput('d'), timestamp: began + 30 },
    '0xpending': { from: BUYER, to: COMMERCE97, input: createInput('d'), timestamp: null },
    '0xold': { from: BUYER, to: COMMERCE97, input: createInput('d'), timestamp: began - 3_600 },
    '0xotherbrief': { from: BUYER, to: COMMERCE97, input: createInput('another brief'), timestamp: began + 30 },
    '0xapprove': { from: BUYER, to: USDT97, input: '0x095ea7b3', timestamp: began + 30 },
    '0xsomeoneelse': { from: '0x000000000000000000000000000000000000dEaD', to: COMMERCE97, input: createInput('d'), timestamp: began + 30 },
  };
  const read = { tx: async (h: string) => txs[h] ?? null };
  const has = async (hashes: string[]) => (await hasEvidence(row({ txHashes: hashes }), read, COMMERCE97)).verified;
  assert.deepEqual(await hasEvidence(row({ txHashes: ['0xmine'] }), read, COMMERCE97), { verified: true, expiredAt: 2_000 }, 'the deadline comes from the wallet’s own create call, not from the client');
  assert.equal(await has(['0xmine']), true, 'the wallet created this attempt’s job, after the record began');
  assert.equal(await has(['0xpending']), true, 'pending counts: it may still land');
  assert.equal(await has(['0xold']), false, 'an old transaction from the wallet proves nothing about this attempt');
  assert.equal(await has(['0xotherbrief']), false, 'another hire’s job is not this attempt');
  assert.equal(await has(['0xapprove']), false, 'an approval is not a create');
  assert.equal(await has(['0xsomeoneelse']), false);
  assert.equal(await has([]), false, 'a record with no identifiers proves nothing');
  const view = (v: boolean): PublicAttempt => publicView(row({ verified: v }));
  assert.equal(remoteDecision(null, null), 'clear');
  assert.equal(remoteDecision(view(true), null), 'block');
  assert.equal(remoteDecision(view(false), null), 'warn', 'unverified: a warning, and the next begin replaces it');
  assert.equal(remoteDecision(view(true), publicIdFor('secret-0123456789')), 'own');
  const shown = publicView(row()) as unknown as Record<string, unknown>;
  assert.ok(!('description' in shown) && !('secretHash' in shown), 'other devices see no brief and no secret');
  assert.notEqual(publicIdFor('s1-0123456789abcdef'), secretHash('s1-0123456789abcdef'), 'the public id does not reveal the secret');
});

test('cross-device: the server closes a record only on chain proof — funded, or no payment can follow', async () => {
  assert.deepEqual(await settleRemote(row({ jobId: '105' }), reader({ jobs: { '105': funded } }), 1_000), { outcome: 'funded', jobId: '105' });
  assert.equal((await settleRemote(row({ jobId: '105' }), reader({ jobs: { '105': { ...funded, statusName: 'OPEN' } } }), 1_000)).outcome, 'open', 'a fund prompt may still be open');
  assert.deepEqual(await settleRemote(row({ jobId: '105' }), reader({ jobs: { '105': { ...funded, statusName: 'OPEN' } } }), 2_001), { outcome: 'impossible' }, 'past the encoded expiry');
  assert.deepEqual(await settleRemote(row({ prompt: 'approving' }), reader(), 1_000), { outcome: 'impossible' }, 'no money-moving prompt was ever issued');
  assert.equal((await settleRemote(row({ prompt: 'batch', fundableUntil: null }), reader(), 9_999_999_999)).outcome, 'open', 'time alone never closes a record');
  assert.deepEqual(await settleRemote(row({ txHashes: ['0xstuck'] }), reader({ txState: async () => 'pending' }), 2_001), { outcome: 'impossible' }, 'a transaction still pending past the encoded deadline can no longer fund it');
  assert.deepEqual(await settleRemote(row({ jobId: '105', fundableUntil: null }), reader({ jobs: { '105': { ...funded, statusName: 'OPEN', expiredAt: 3_000n } } }), 3_001), { outcome: 'impossible' }, 'or past the job’s own on-chain deadline');
  assert.equal((await settleRemote(row({ jobId: '105', fundableUntil: null }), reader({ jobs: { '105': { ...funded, statusName: 'OPEN', expiredAt: 3_000n } } }), 2_999)).outcome, 'open');
  assert.deepEqual(await settleRemote(row({ jobId: '105' }), reader({ jobs: { '105': { ...funded, budget: 7n } } }), 1_000), { outcome: 'mismatch', jobId: '105' }, 'funded in another amount: kept as a job by the caller');
});

test('per-token limits, in each token’s own units; a signed price outside them is refused, never trimmed', () => {
  assert.deepEqual(budgetLimitsFor({ decimals: 6, symbol: 'X' }), { minRaw: 10_000n, maxRaw: 5_000_000n, min: 0.01, max: 5, symbol: 'X' });
  assert.deepEqual(amountWithinLimits({ decimals: 18, symbol: 'USDT' }, 5n * 10n ** 18n), { ok: true });
  const over = planCommission({ escrowChainId: 56, walletMode: 'external', quote: { currency: USDT56, amountRaw: (6n * 10n ** 18n).toString() }, budgetU: 1, agentName: 'A', tokens: ON });
  assert.equal(!over.ok && over.code, 'above-limit');
  assert.match(!over.ok ? over.message : '', /signed 6 Binance-Peg USDT\. Pokter funds a job of at most 5 Binance-Peg USDT/);
  const under = planCommission({ escrowChainId: 56, walletMode: 'external', quote: { currency: USDT56, amountRaw: '1' }, budgetU: 1, agentName: 'A', tokens: ON });
  assert.equal(!under.ok && under.code, 'below-limit');
});

test('the backfill writes an audit line per job on a write run, and none on a dry run', async () => {
  const lines: string[] = [];
  const run = (write: boolean) => backfillJobCurrencies({
    rows: [{ chainId: 97, jobId: '1' }, { chainId: 97, jobId: '2' }, { chainId: 97, jobId: '3' }],
    read: async (_c, id) => (id === '1' ? USDT97 : id === '2' ? USDT97 : null),
    write,
    set: (_c, id) => (id === '1' ? 1 : 0),
    audit: (e) => lines.push(`${e.jobId}:${e.outcome}`),
  });
  await run(false);
  assert.deepEqual(lines, [], 'dry run: nothing recorded');
  await run(true);
  assert.deepEqual(lines, ['1:written', '2:already-set', '3:unread']);
});

test('a job created but not yet budgeted is unfunded and resumable, never a permanent mismatch', async () => {
  const a = attempt({ prompt: 'budgeting', txHashes: ['0xcreate'] });
  const mined = async () => ({ status: 'success' as const, logs: ['105'] });
  const open = { ...funded, budget: 0n, statusName: 'OPEN' };
  const verdict = await reconcileAttempt(a, reader({ receipt: mined, jobs: { '105': open } }));
  assert.deepEqual({ outcome: verdict.outcome, jobId: 'jobId' in verdict ? verdict.jobId : null }, { outcome: 'not-funded', jobId: '105' });
  /* And the local record closes, since no money-moving prompt was outstanding. */
  const kv = memory();
  const C = fundingCoordinator(kv, locks(), 'A');
  kv.setItem(`pokter:funding-attempt:97:${BUYER.toLowerCase()}`, JSON.stringify(a));
  assert.equal(await C.settle(a, verdict, 1_000), 'closed-not-funded');
});

test('another hire of the same agent by the same wallet is never mistaken for this attempt', async () => {
  const a = attempt({ jobId: null, predictedJobId: '100', txHashes: [] });
  const jobs = { '100': { ...funded, description: 'an earlier brief', budget: 99n }, '101': { ...funded, budget: 10n } };
  assert.deepEqual(await reconcileAttempt(a, reader({ jobs })), { outcome: 'funded', jobId: '101' }, 'skips the earlier job and finds this one');
  const onlyOther = { '100': { ...funded, description: 'an earlier brief', budget: 99n } };
  assert.equal((await reconcileAttempt(a, reader({ jobs: onlyOther }))).outcome, 'not-funded');
});

test('a record closes only on proof: its encoded deadline, or its job’s on-chain one — never because time passed', async () => {
  const kv = memory();
  const C = fundingCoordinator(kv, locks(), 'A');
  const key = `pokter:funding-attempt:97:${BUYER.toLowerCase()}`;
  const a = attempt();
  kv.setItem(key, JSON.stringify(a));
  assert.equal(await C.settle(a, { outcome: 'pending', detail: '' }, 1_000), 'kept');
  assert.equal(await C.settle(a, { outcome: 'pending', detail: '' }, 2_001), 'closed-not-funded', 'past the deadline its calls encoded, a stuck transaction cannot fund it');
  const unknown = attempt({ fundableUntil: null });
  kv.setItem(key, JSON.stringify(unknown));
  assert.equal(await C.settle(unknown, { outcome: 'pending', detail: '' }, 9_999_999_999), 'kept', 'no deadline, no proof: kept however long');
  assert.equal(await C.settle(unknown, { outcome: 'not-funded', jobId: '105', detail: '', expiredAt: 3_000 }, 2_999), 'kept-may-still-pay');
  assert.equal(await C.settle(unknown, { outcome: 'not-funded', jobId: '105', detail: '', expiredAt: 3_000 }, 3_001), 'closed-not-funded', 'the job’s on-chain deadline is proof');
});

test('a money-moving prompt is refused before the wallet is asked unless its deadline is recorded', async () => {
  const C = fundingCoordinator(memory(), locks(), 'A');
  const begin = { wallet: BUYER, chainId: 97, provider: PROVIDER, agent: { chainId: 97, tokenId: '1', name: 'x' }, task: 't', description: 'd', token: USDT97, amountRaw: '10', startedAt: '2026-10-26T10:00:00.000Z', predictedJobId: '100' };
  await assert.rejects(C.run(begin, async (s) => { s.beforePrompt('creating'); s.beforePrompt('funding'); }), DeadlineNotRecorded);
  /* The refused attempt stays recorded, as an attempt that sent nothing; a fresh browser shows the allowed path. */
  const ok = await fundingCoordinator(memory(), locks(), 'B').run({ ...begin, description: 'd2' }, async (s) => { s.beforePrompt('creating'); s.note({ fundableUntil: 2_000 }); s.beforePrompt('funding'); s.close(); return 'asked'; });
  assert.deepEqual(ok, { ok: true, value: 'asked' });
});

test('a wrong-amount job is adopted, not dropped, and its quote can never be paid again', async () => {
  const kv = memory();
  const C = fundingCoordinator(kv, locks(), 'A');
  const key = `pokter:funding-attempt:97:${BUYER.toLowerCase()}`;
  const a = attempt();
  kv.setItem(key, JSON.stringify(a));
  const adopted: string[] = [];
  assert.equal(await C.settle(a, { outcome: 'mismatch', jobId: '105', detail: '' }, 1_000, async (id) => void adopted.push(id)), 'closed-mismatch');
  assert.deepEqual(adopted, ['105'], 'recorded as a funded job, with what the chain holds');
  assert.equal(kv.getItem(key), null);
  const again = await C.run({ wallet: BUYER, chainId: 97, provider: PROVIDER, agent: a.agent, task: 't', description: a.description, token: USDT97, amountRaw: '10', startedAt: '2026-10-26T10:05:00.000Z', predictedJobId: '106' }, async () => 'paid twice');
  assert.deepEqual(again, { ok: false, reason: 'already-funded', jobId: '105' }, 'the same signed quote is refused');
  const fresh = await C.run({ wallet: BUYER, chainId: 97, provider: PROVIDER, agent: a.agent, task: 't', description: 'a fresh quote', token: USDT97, amountRaw: '10', startedAt: '2026-10-26T10:06:00.000Z', predictedJobId: '106' }, async () => 'new hire');
  assert.deepEqual(fresh, { ok: true, value: 'new hire' }, 'a fresh quote is a new hire');
});

test('a funded attempt closed by its owner also spends its quote', async () => {
  const C = fundingCoordinator(memory(), locks(), 'A');
  const begin = { wallet: BUYER, chainId: 97, provider: PROVIDER, agent: { chainId: 97, tokenId: '1', name: 'x' }, task: 't', description: 'once', token: USDT97, amountRaw: '10', startedAt: '2026-10-26T10:00:00.000Z', predictedJobId: '100' };
  await C.run(begin, async (s) => { s.note({ fundableUntil: 2_000_000_000, jobId: '100' }); s.beforePrompt('funding'); s.close(); });
  assert.deepEqual(await C.run(begin, async () => 'twice'), { ok: false, reason: 'already-funded', jobId: '100' });
});

test('an error before the wallet is asked closes the attempt and is shown; only a fund or batch prompt stays pending', async () => {
  const { promptMovesMoney } = await import('../src/lib/hire/funding-journal');
  assert.equal(promptMovesMoney('swapping'), false, 'a swap quote failing cannot have paid the escrow');
  assert.equal(promptMovesMoney('creating'), false);
  assert.equal(promptMovesMoney('approving'), false);
  assert.equal(promptMovesMoney('funding'), true);
  assert.equal(promptMovesMoney('batch'), true);
  assert.equal(promptMovesMoney(null), false);
  const hook = readFileSync('src/lib/hire/useHire.ts', 'utf8');
  assert.match(hook, /if \(sentNothing && \(caught instanceof AttemptOwnershipLost \|\| caught instanceof DeadlineNotRecorded \|\| isWalletRejection\(caught\) \|\| !promptMovesMoney\(current\?\.prompt\)\)\)/, 'closed and rethrown, so the buyer sees why');
});

test('the browser-wallet read client carries the real chain, so the $U shortfall swap quotes on 56 and 97', async () => {
  const { wrappedNative } = await import('../src/lib/pancakeswap/swap');
  assert.equal(wrappedNative(56), '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c');
  assert.equal(wrappedNative(97), '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd');
  assert.throws(() => wrappedNative(0), /chain 0/, 'what a client without a chain id produced');
  const wallet = readFileSync('src/lib/wallet/external.ts', 'utf8');
  assert.match(wallet, /read: createPublicClient\(\{[^}]*chain: network\.chain,/s, 'the read client is built from the viem chain, whose `id` the swap reads');
});
