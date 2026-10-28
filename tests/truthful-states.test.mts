import assert from 'node:assert/strict';
import test from 'node:test';

import { earnedByNetwork } from '../src/lib/builder/earnings';
import { draftSaveStatus, type DraftFields, type StoredDraft } from '../src/lib/builder/drafts';

const U = (n: number) => (BigInt(n) * 10n ** 18n).toString();

test('test-token payments are never counted as earnings', () => {
  /* Positively identified $U on each chain; see the next test for jobs whose token is not. */
  const U56 = '0xcE24439F2D9C6a2289F741120FE202248B666666';
  const U97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
  const jobs = [
    { chainId: 56, status: 'COMPLETED', budgetRaw: U(2), paymentToken: U56 },
    { chainId: 97, status: 'COMPLETED', budgetRaw: U(5), paymentToken: U97 },
    { chainId: 56, status: 'FUNDED', budgetRaw: U(9), paymentToken: U56 },
  ];
  const earned = earnedByNetwork(jobs);
  assert.equal(earned.real, BigInt(U(2)));
  assert.equal(earned.test, BigInt(U(5)));
});

test('earnings in $U leave out jobs in other money and jobs whose token is not read yet', () => {
  const earned = earnedByNetwork([
    { chainId: 56, status: 'COMPLETED', budgetRaw: U(2), paymentToken: '0xcE24439F2D9C6a2289F741120FE202248B666666' },
    { chainId: 56, status: 'COMPLETED', budgetRaw: U(7), paymentToken: '0x55d398326f99059fF775485246999027B3197955' },
    { chainId: 56, status: 'COMPLETED', budgetRaw: U(11), paymentToken: null },
  ]);
  assert.equal(earned.real, BigInt(U(2)), 'USDT and unknown are not $U');
});

const fields = (name: string): DraftFields => ({ name, description: '', category: '', protocol: 'a2a', endpoint: '', image: '', repository: '' });
const stored = (id: string, name: string): StoredDraft => ({ id, draft: fields(name), mode: 'new', step: 0, updatedAt: '2026-10-17T00:00:00.000Z' });

test('a draft reads Saved only when storage holds this exact copy', () => {
  assert.equal(draftSaveStatus([stored('d1', 'Gridloom')], 'd1', fields('Gridloom'), false), 'saved');
  assert.equal(draftSaveStatus([stored('d1', 'Gridloo')], 'd1', fields('Gridloom'), false), 'saving');
  assert.equal(draftSaveStatus([], 'd1', fields('Gridloom'), false), 'saving');
});

test('a failed write never reads as saved, even with an older copy stored', () => {
  assert.equal(draftSaveStatus([stored('d1', 'Gridloom')], 'd1', fields('Gridloom'), true), 'failed');
});

test('an empty form makes no save claim', () => {
  assert.equal(draftSaveStatus([], 'd1', fields(''), false), 'empty');
});
