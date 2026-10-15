import assert from 'node:assert/strict';
import test from 'node:test';

import { quoteUsableForEscrow } from '../src/lib/erc8183/negotiation';
import { checkPurchaseIntent, type PurchaseIntent } from '../src/lib/hire/purchase-intent';

const MAINNET_ESCROW = '0xEa4DAa3100A767e86FDed867729ae7446476EBA6';
const OTHER_CONTRACT = '0x1111111111111111111111111111111111111111';
const U = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const TEST_U = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const PROVIDER = '0x071044a5A92F6C90cf9D08D5059921da734D19e7';
const now = Date.parse('2026-10-15T12:00:00Z');

test('a quote signed for another contract on the right chain is not usable', () => {
  const quote = { domain: { chainId: 56, verifyingContract: OTHER_CONTRACT as `0x${string}` } };
  const verdict = quoteUsableForEscrow(quote, 56, new Date(now), MAINNET_ESCROW);
  assert.equal(verdict.usable, false);
  assert.match((verdict as { reason: string }).reason, /escrow/);
  // The right contract, and an unbound quote, stay usable.
  assert.equal(quoteUsableForEscrow({ domain: { chainId: 56, verifyingContract: MAINNET_ESCROW } }, 56, new Date(now), MAINNET_ESCROW).usable, true);
  assert.equal(quoteUsableForEscrow({}, 56, new Date(now), MAINNET_ESCROW).usable, true);
});

const intent: PurchaseIntent = { provider: PROVIDER, task: 'Check 0xfb5B838b6cfEEdC2873aB27866079AC55363D37E', amountRaw: '50000000000000000', currency: U, chainId: 56, verifyingContract: MAINNET_ESCROW, expiresAt: now / 1000 + 900, negotiationHash: '0x1' };
const funding = { provider: PROVIDER, task: intent.task, chainId: 56, commerce: MAINNET_ESCROW, paymentToken: U };

test('the funding that matches what was signed goes ahead', () => {
  assert.deepEqual(checkPurchaseIntent(intent, funding, now), { ok: true });
});

test('a stale page network, a different token or contract, a changed brief or provider, or an expiring price all stop the hire', () => {
  // The review's case: page opened on testnet, fresh quote on mainnet.
  assert.match((checkPurchaseIntent(intent, { ...funding, chainId: 97, paymentToken: TEST_U }, now) as { reason: string }).reason, /settles on chain 56.*chain 97/);
  assert.equal(checkPurchaseIntent(intent, { ...funding, paymentToken: TEST_U }, now).ok, false);
  assert.match((checkPurchaseIntent(intent, { ...funding, commerce: OTHER_CONTRACT }, now) as { reason: string }).reason, /signed this price for escrow/);
  assert.match((checkPurchaseIntent(intent, { ...funding, task: `${intent.task} please` }, now) as { reason: string }).reason, /brief changed/);
  assert.equal(checkPurchaseIntent(intent, { ...funding, provider: OTHER_CONTRACT }, now).ok, false);
  // Expires within the wallet steps still to come.
  assert.match((checkPurchaseIntent({ ...intent, expiresAt: now / 1000 + 30 }, funding, now) as { reason: string }).reason, /expires/);
});
