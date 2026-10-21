import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyTx, INCREASE_LIQUIDITY_TOPIC, TRANSFER_TOPIC, type RawLog } from '../src/lib/trading/flows';

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
const base = { wallet: W, positionManager: PM, ownedPositions: new Set(['7']) };

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
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 5n), inc(7n)] }).verdict, 'added-liquidity');
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, POOL, 5n), inc(8n)] }).verdict, 'not-returned');
});

test('nothing leaving the wallet says nothing; a zero-amount transfer is not a loss', () => {
  assert.equal(classifyTx({ ...base, logs: [erc20(WBNB, POOL, W, 3n)] }).verdict, null);
  assert.equal(classifyTx({ ...base, logs: [erc20(USDT, W, THIEF, 0n)] }).verdict, null);
});
