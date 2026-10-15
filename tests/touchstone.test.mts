import assert from 'node:assert/strict';
import test from 'node:test';

import { isDelegatedWallet, readTouchstoneBrief, touchstoneVerdict, type TokenFacts } from '../src/lib/house/agents/touchstone-math';

const clean: TokenFacts = { isContract: true, symbol: 'X', probe: { stage: 0, buyTax: 0, sellTax: 0 }, owner: { address: '0x000000000000000000000000000000000000dEaD', renounced: true }, powers: [], upgradable: false, liquidityUsd: 5_000_000, lpBurnedShare: 0, ownerShare: null, burnedShare: 0 };
const levels = (facts: TokenFacts) => touchstoneVerdict(facts).reasons.map((r) => r.level);

test('a clean, renounced, deep token is Safe', () => {
  assert.equal(touchstoneVerdict(clean).verdict, 'Safe');
  // FLOKI's real 0.3% fee stays Safe.
  assert.equal(touchstoneVerdict({ ...clean, probe: { stage: 0, buyTax: 0.003, sellTax: 0.003 } }).verdict, 'Safe');
});

test('cannot sell, or a 10% tax, is Avoid', () => {
  assert.equal(touchstoneVerdict({ ...clean, probe: { stage: 6, buyTax: 0, sellTax: null } }).verdict, 'Avoid');
  assert.match(touchstoneVerdict({ ...clean, probe: { stage: 6, buyTax: 0, sellTax: null } }).reasons[0].finding, /Honeypot/);
  assert.equal(touchstoneVerdict({ ...clean, probe: { stage: 0, buyTax: 0, sellTax: 0.12 } }).verdict, 'Avoid');
  assert.equal(touchstoneVerdict({ ...clean, isContract: false }).verdict, 'Avoid');
});

test('untestable, taxed, owner powers, upgradable or thin is Caution', () => {
  assert.equal(touchstoneVerdict({ ...clean, probe: { stage: 2, buyTax: null, sellTax: null } }).verdict, 'Caution');
  assert.equal(touchstoneVerdict({ ...clean, probe: { stage: 0, buyTax: 0.05, sellTax: 0.05 } }).verdict, 'Caution');
  const owned = touchstoneVerdict({ ...clean, owner: { address: '0x73feaa1eE314F8c655E354234017bE2193C9E24E', renounced: false, isContract: true }, powers: ['mint'] });
  assert.equal(owned.verdict, 'Caution');
  assert.match(owned.reasons.find((r) => r.level === 'caution')!.finding, /a contract, 0x73fe.*mint/);
  assert.equal(touchstoneVerdict({ ...clean, upgradable: true }).verdict, 'Caution');
  assert.equal(touchstoneVerdict({ ...clean, liquidityUsd: 9_000 }).verdict, 'Caution');
});

test('LP burn matters only for a small pool, and an unreadable owner is not labelled', () => {
  assert.ok(!levels({ ...clean, owner: { address: '0xabc', renounced: false }, lpBurnedShare: 0 }).includes('caution'));
  const small = touchstoneVerdict({ ...clean, owner: { address: '0xabc', renounced: false }, liquidityUsd: 100_000, lpBurnedShare: 0.1 });
  assert.match(small.reasons.map((r) => r.finding).join(' '), /small pool’s LP tokens are burned/);
  const unknown = touchstoneVerdict({ ...clean, owner: { address: '0xabc', renounced: false, isContract: null }, powers: ['mint'] });
  assert.match(unknown.reasons.find((r) => r.level === 'caution')!.finding, /^An active owner \(0xabc\)/);
});

test('smart-account wallets are wallets; briefs need a token address', () => {
  assert.equal(isDelegatedWallet('0xef01009736a95f6a5c24165ecf282e3e08016715460aac'), true);
  assert.equal(isDelegatedWallet('0x6080604052'), false);
  assert.equal(readTouchstoneBrief('Is 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 a honeypot?').token, '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82');
  assert.equal(readTouchstoneBrief('Is CAKE safe?').token, null);
});
