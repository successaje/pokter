import assert from 'node:assert/strict';
import test from 'node:test';

import { commissionAuthority } from '../src/lib/hire/commission-authority';

test('commission authority is bounded to one exact budget without a wallet session', () => {
  const authority = commissionAuthority({ paymentToken: '0xtoken', escrowContract: '0xescrow', budgetU: 0.1 });
  assert.equal(authority.budgetU, 0.1);
  assert.equal(authority.approvalScope, 'exact-budget');
  assert.equal(authority.walletAuthority, 'none');
  assert.equal(authority.canRevokeUnusedApproval, true);
});

test('invalid budgets never produce a permission summary', () => {
  assert.throws(() => commissionAuthority({ paymentToken: '0xtoken', escrowContract: '0xescrow', budgetU: 0 }));
  assert.throws(() => commissionAuthority({ paymentToken: '0xtoken', escrowContract: '0xescrow', budgetU: Number.NaN }));
});

