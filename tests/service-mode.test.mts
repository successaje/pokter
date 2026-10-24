import assert from 'node:assert/strict';
import test from 'node:test';

import { POKTER_TERMS } from '../src/lib/erc8183/terms';
import { serviceModeOf } from '../src/lib/hire/service-mode';

test('a report, on the agent’s own signature, only when it signed the read-only standard', () => {
  const r = serviceModeOf({ signedTerms: { ...POKTER_TERMS }, relayed: false });
  assert.equal(r.mode, 'report');
  assert.match(r.basis, /own signature covers it/);
  assert.equal(r.deliverable, POKTER_TERMS.deliverables);
});

test('other signed terms are quoted, and no mode is claimed', () => {
  const r = serviceModeOf({ signedTerms: { deliverables: 'Executed trades', quality_standards: 'Will rebalance the vault on your behalf.' }, relayed: false });
  assert.equal(r.mode, 'unknown');
  assert.match(r.basis, /rebalance the vault/);
  assert.equal(r.deliverable, 'Executed trades');
  assert.equal(serviceModeOf({ signedTerms: { deliverables: '' }, relayed: false }).mode, 'unknown');
});

test('before the agent signs, the mode is what Pokter asks for, said as such', () => {
  const r = serviceModeOf({ signedTerms: null, relayed: false });
  assert.match(r.label, /as asked/);
  assert.match(r.basis, /before anything is funded/);
});

test('a relayed hire is a report on Pokter’s word, not the agent’s', () => {
  assert.match(serviceModeOf({ signedTerms: null, relayed: true }).basis, /not on the agent’s signature/);
});
