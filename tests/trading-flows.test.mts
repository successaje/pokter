import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyTx, COLLECT_TOPIC, INCREASE_LIQUIDITY_TOPIC, poolCandidates, TRANSFER_TOPIC, type RawLog } from '../src/lib/trading/flows';

const W = '0x561b561ef37874c8e61534be9bae52eb6261ddc4';
const POOL = '0x36696169c63e42cd08ce11f5deebbcebae652050';
const PM = '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364';
const THIEF = '0x000000000000000000000000000000000000dead';
const USDT = '0x55d398326f99059ff775485246999027b3197955';
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
const t = (a: string) => `0x${'0'.repeat(24)}${a.slice(2)}`;
const erc20 = (token: string, from: string, to: string, amount: bigint): RawLog => ({ address: token, topics: [TRANSFER_TOPIC, t(from), t(to)], data: `0x${amount.toString(16).padStart(64, '0')}` });
const nft = (from: string, to: string, id: bigint): RawLog => ({ address: PM, topics: [TRANSFER_TOPIC, t(from), t(to), `0x${id.toString(16).padStart(64, '0')}`], data: '0x' });
const inc = (id: bigint): RawLog => ({ address: PM, topics: [INCREASE_LIQUIDITY_TOPIC, `0x${id.toString(16).padStart(64, '0')}`], data: '0x' });
const FAKE = '0x00000000000000000000000000000000000fa4e0';
const OTHER_NFT = '0x00000000000000000000000000000000000000a1';
const word = (n: bigint | string) => (typeof n === 'string' ? n.slice(2).padStart(64, '0') : n.toString(16).padStart(64, '0'));
const collect = (id: bigint, recipient: string, a0: bigint, a1: bigint): RawLog => ({ address: PM, topics: [COLLECT_TOPIC, `0x${word(id)}`], data: `0x${word(recipient)}${word(a0)}${word(a1)}` });
const base = { wallet: W, positionManager: PM, ownedPositions: new Set(['7']), knownTokens: new Set([USDT, WBNB]), pools: new Map([[POOL, [WBNB, USDT] as const]]) };

test('a swap that pays the wallet back is returned', () => {
  const f = classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 10n ** 18n), erc20(WBNB, POOL, W, 10n ** 15n)] });
  assert.equal(f.verdict, 'returned');
});

test('a swap whose output goes to someone else is not returned: the gap a call allowlist leaves', () => {
  const f = classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 10n ** 18n), erc20(WBNB, POOL, THIEF, 10n ** 15n)] });
  assert.equal(f.verdict, 'not-returned');
  assert.equal(f.outs[0].to, POOL);
});

test('a plain transfer out is not returned, unless to an address the owner listed', () => {
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, THIEF, 5n)] }).verdict, 'not-returned');
  assert.equal(classifyTx({ ...base, ownerAddresses: [THIEF], logs: [erc20(USDT, W, THIEF, 5n)] }).verdict, 'to-owner');
});

test('minting a position returns an NFT; adding to the wallet’s own position is kept', () => {
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 5n), nft('0x0000000000000000000000000000000000000000', W, 9n)] }).verdict, 'returned');
  // An NFT from any other contract is not a position.
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 5n), { ...nft('0x0000000000000000000000000000000000000000', W, 9n), address: OTHER_NFT }] }).verdict, 'not-returned');
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 5n), inc(7n)] }).verdict, 'added-liquidity');
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 5n), inc(8n)] }).verdict, 'not-returned');
});

test('nothing leaving the wallet says nothing; a zero-amount transfer is not a loss', () => {
  assert.equal(classifyTx({ ...base, logs: [erc20(WBNB, POOL, W, 3n)] }).verdict, null);
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, THIEF, 0n)] }).verdict, null);
});

/*
 * The cases that used to pass as safe and so would have sent no alert.
 * Each one is a real outflow; each one must read as not returned.
 */
test('a Transfer log from a token the wallet does not trade is not a payment back', () => {
  const f = classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 10n ** 18n), erc20(FAKE, POOL, W, 10n ** 30n)] });
  assert.equal(f.verdict, 'not-returned');
});

test('a zero-amount transfer in is not a payment back', () => {
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 10n ** 18n), erc20(WBNB, POOL, W, 0n)] }).verdict, 'not-returned');
});

test('an honest swap does not vouch for a drain in the same transaction', () => {
  const f = classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 10n ** 18n), erc20(WBNB, POOL, W, 10n ** 15n), erc20(USDT, W, THIEF, 500n * 10n ** 18n)] });
  assert.equal(f.verdict, 'not-returned');
  assert.match(f.note, new RegExp(THIEF));
});

test('a drain paid back with a little of a real token is still a drain', () => {
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, THIEF, 500n * 10n ** 18n), erc20(WBNB, THIEF, W, 1n)] }).verdict, 'not-returned');
});

test('tokens sent to a contract that is not a confirmed pool are not a trade', () => {
  const notAPool = '0x00000000000000000000000000000000000c0de0';
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, notAPool, 10n ** 18n), erc20(WBNB, notAPool, W, 10n ** 15n)] }).verdict, 'not-returned');
});

test('a position NFT leaving the wallet is an outflow, unless to an address the owner listed', () => {
  const f = classifyTx({ ...base, logs: [nft(W, THIEF, 7n)] });
  assert.equal(f.verdict, 'not-returned');
  assert.deepEqual(f.outs.map((o) => [o.kind, o.positionId]), [['position', '7']]);
  assert.equal(classifyTx({ ...base, ownerAddresses: [THIEF], logs: [nft(W, THIEF, 7n)] }).verdict, 'to-owner');
});

test('collecting a position to somebody else is an outflow, though nothing leaves the wallet balance', () => {
  const f = classifyTx({ ...base, logs: [collect(7n, THIEF, 10n ** 18n, 0n), erc20(USDT, POOL, THIEF, 10n ** 18n)] });
  assert.equal(f.verdict, 'not-returned');
  assert.equal(f.outs[0].kind, 'collect');
});

test('collecting to the wallet, an empty collect, and another wallet’s position are not outflows', () => {
  assert.equal(classifyTx({ ...base, logs: [collect(7n, W, 10n ** 18n, 5n), erc20(USDT, POOL, W, 10n ** 18n)] }).verdict, null);
  assert.equal(classifyTx({ ...base, logs: [collect(7n, THIEF, 0n, 0n)] }).verdict, null);
  assert.equal(classifyTx({ ...base, logs: [collect(8n, THIEF, 10n ** 18n, 0n)] }).verdict, null);
});

test('the other side of each token transfer is a candidate to check against the factory, once', () => {
  const OTHER = '0x0000000000000000000000000000000000000b0b';
  const logs = [erc20(USDT, W, POOL, 1n), erc20(WBNB, POOL, W, 1n), erc20(USDT, OTHER, W, 2n), nft(W, THIEF, 7n), erc20(USDT, THIEF, POOL, 3n)];
  assert.deepEqual(poolCandidates(W, logs), [POOL, OTHER]);
});

test('a swap into a token the wallet does not watch counts, when the pool really holds that token', () => {
  const RARE = '0x570a5d26f7765ecb712c0924e4de545b89fd43df';
  const RARE_POOL = '0x9f5a0ad81fe7fd5dfb84ee7a0cfb83967359bd90';
  const pools = new Map([[RARE_POOL, [USDT, RARE] as const]]);
  // As on chain in 0xa83d785f…: USDT in, the pool's other token out to the wallet.
  assert.equal(classifyTx({ ...base, pools, logs: [erc20(RARE, RARE_POOL, W, 10n ** 18n), erc20(USDT, W, RARE_POOL, 135n * 10n ** 18n)] }).verdict, 'returned');
  // A fake token claiming to come from that pool is not one of its tokens.
  assert.equal(classifyTx({ ...base, pools, logs: [erc20(FAKE, RARE_POOL, W, 10n ** 18n), erc20(USDT, W, RARE_POOL, 135n * 10n ** 18n)] }).verdict, 'not-returned');
});
