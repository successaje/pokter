import assert from 'node:assert/strict';
import test from 'node:test';

import { negotiationSkillOf } from '../src/lib/erc8183/courier-parse';

test('the price is asked through the negotiate skill as the agent names it', () => {
  assert.equal(negotiationSkillOf([{ id: 'negotiate-erc8183-job' }, { id: 'health_factor' }]), 'negotiate-erc8183-job');
  assert.equal(negotiationSkillOf([{ id: 'negotiate-erc8183-job' }, { id: 'negotiate' }]), 'negotiate');
  assert.equal(negotiationSkillOf([{ name: 'negotiate' }]), 'negotiate');
});

test('skills that only mention negotiation are not mistaken for it', () => {
  assert.equal(negotiationSkillOf([{ id: 'health_factor' }, { id: 'renegotiate-loan' }]), null);
  assert.equal(negotiationSkillOf([]), null);
});
