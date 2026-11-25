import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { keeperAccountFrom, keeperConfig, keeperKeyState, planKeeperJob } from '../src/lib/erc8183/keeper-plan';

/*
 * The keeper's rules. Each decides where real escrow goes, so each refusal
 * and each "send" is held here rather than trusted to a reading of the loop.
 */

const WEEK = 604_800;
const DAY = 86_400;
/* Mainnet's shape: funded, delivered within the day, reviewed for a week. */
const FUNDED_AT = 1_762_700_000;
const SUBMITTED_AT = FUNDED_AT + 6 * 3600;
const EXPIRES_AT = FUNDED_AT + DAY + WEEK;
const context = (now: number) => ({ disputeWindowSeconds: WEEK, now });

test('the keeper is off unless switched on, and testnet only unless mainnet is named', () => {
  assert.deepEqual(keeperConfig({}), { mode: 'off', chains: [97] });
  assert.equal(keeperConfig({ KEEPER: 'yes' }).mode, 'off', 'anything but on or dry is off');
  assert.equal(keeperConfig({ KEEPER: ' ON ' }).mode, 'on');
  assert.equal(keeperConfig({ KEEPER: 'dry' }).mode, 'dry');
  assert.deepEqual(keeperConfig({ KEEPER: 'on', KEEPER_CHAINS: '' }).chains, [97]);
  assert.deepEqual(keeperConfig({ KEEPER: 'on', KEEPER_CHAINS: '56' }).chains, [56]);
  assert.deepEqual(keeperConfig({ KEEPER_CHAINS: '97, 56,97,bsc,1' }).chains, [56, 97], 'mainnet first, each chain once, unknown entries ignored');
});

test('the keeper signs only with a wallet of its own', () => {
  const key = generatePrivateKey();
  const own = keeperAccountFrom(` ${key} `, null);
  assert.equal(own.account?.address, privateKeyToAccount(key).address);

  assert.deepEqual(keeperAccountFrom(undefined, null), { account: null, error: 'KEEPER_KEY is not set' });
  assert.match((keeperAccountFrom(key.slice(2), null) as { error: string }).error, /with its 0x prefix/, 'a key without its prefix is refused, not guessed at');
  /*
   * The operator key also sends from the server. Two senders on one nonce
   * drop each other's transactions, so the keeper refuses it outright.
   */
  const operator = privateKeyToAccount(key).address.toLowerCase();
  assert.match((keeperAccountFrom(key, operator) as { error: string }).error, /operator key/);
});

test('whether the key can be used is answerable without the key', () => {
  /*
   * The question a dry run cannot answer. `from` falls back to a stand-in
   * sender whenever there is no usable account, and the error is read only
   * when the keeper is `on`, so a typo in the secret looks exactly like a
   * correct one until the day it is switched on. This is what health
   * reports instead, and it must never be the key or the address.
   */
  const key = generatePrivateKey();
  assert.equal(keeperKeyState(key, null), 'ok');
  assert.equal(keeperKeyState(` ${key} `, null), 'ok', 'a pasted key with whitespace is still usable');
  assert.equal(keeperKeyState(undefined, null), 'missing');
  assert.equal(keeperKeyState('   ', null), 'missing');
  assert.equal(keeperKeyState(key.slice(2), null), 'invalid', 'no 0x prefix');
  assert.equal(keeperKeyState(`${key}ab`, null), 'invalid', 'too long');
  assert.equal(keeperKeyState(privateKeyToAccount(key).address, null), 'invalid', 'an address pasted in place of the key');
  assert.equal(keeperKeyState(key, privateKeyToAccount(key).address.toLowerCase()), 'operator');

  for (const state of ['ok', 'missing', 'invalid', 'operator']) {
    assert.ok(!String(state).startsWith('0x'), 'the state is a word, never an address or a key');
  }
});

test('the state and the refusal cannot disagree', () => {
  /*
   * Health reads the state and the keeper reads the account. Were they
   * classified apart, health could report a usable key for one the keeper
   * then refuses, which is worse than reporting nothing.
   */
  const key = generatePrivateKey();
  const operator = privateKeyToAccount(key).address;
  for (const [value, op] of [[key, null], [undefined, null], [key.slice(2), null], [key, operator]] as const) {
    const usable = keeperAccountFrom(value, op).account !== null;
    assert.equal(usable, keeperKeyState(value, op) === 'ok', `disagreed on ${String(value).slice(0, 10)}`);
  }
});

test('a delivery waits for its review window, then is settled', () => {
  const job = { statusName: 'SUBMITTED', submittedAt: SUBMITTED_AT, expiredAt: EXPIRES_AT };
  assert.deepEqual(planKeeperJob(job, context(SUBMITTED_AT + WEEK - 1)), { action: 'wait', until: SUBMITTED_AT + WEEK, reason: 'review window still open' });
  assert.deepEqual(planKeeperJob(job, context(SUBMITTED_AT + WEEK)), { action: 'settle', pastDeadline: false }, 'the second the window closes');
});

test('a delivery past its deadline is still settled, never refunded', () => {
  /*
   * From the deadline the escrow would let anyone refund it. The keeper
   * settles instead: the work was delivered and the window passed without
   * the vote rejecting it.
   */
  const job = { statusName: 'SUBMITTED', submittedAt: SUBMITTED_AT, expiredAt: EXPIRES_AT };
  assert.deepEqual(planKeeperJob(job, context(EXPIRES_AT + 3600)), { action: 'settle', pastDeadline: true });
});

test('a delivery with no submission time is left alone', () => {
  assert.equal(planKeeperJob({ statusName: 'SUBMITTED', submittedAt: 0, expiredAt: EXPIRES_AT }, context(EXPIRES_AT + 1)).action, 'none');
});

test('an undelivered job is refunded from its deadline, not before', () => {
  const job = { statusName: 'FUNDED', submittedAt: 0, expiredAt: EXPIRES_AT };
  assert.deepEqual(planKeeperJob(job, context(EXPIRES_AT - 1)), { action: 'wait', until: EXPIRES_AT, reason: 'the agent still has time to deliver' });
  assert.deepEqual(planKeeperJob(job, context(EXPIRES_AT)), { action: 'refund' });
});

test('a job with nothing left in escrow is never acted on', () => {
  for (const statusName of ['OPEN', 'COMPLETED', 'REJECTED', 'EXPIRED', 'UNKNOWN']) {
    const plan = planKeeperJob({ statusName, submittedAt: SUBMITTED_AT, expiredAt: EXPIRES_AT }, context(EXPIRES_AT + WEEK));
    assert.equal(plan.action, 'none', statusName);
  }
});
