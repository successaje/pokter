import assert from 'node:assert/strict';
import test from 'node:test';

import { earnedByNetwork } from '../src/lib/builder/earnings';
import { draftSaveStatus, type DraftFields, type StoredDraft } from '../src/lib/builder/drafts';

const U = (n: number) => (BigInt(n) * 10n ** 18n).toString();

test('test-token payments are never counted as earnings', () => {
  const jobs = [
    { chainId: 56, status: 'COMPLETED', budgetRaw: U(2) },
    { chainId: 97, status: 'COMPLETED', budgetRaw: U(5) },
    { chainId: 56, status: 'FUNDED', budgetRaw: U(9) },
  ];
  const earned = earnedByNetwork(jobs);
  assert.equal(earned.real, BigInt(U(2)));
  assert.equal(earned.test, BigInt(U(5)));
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
