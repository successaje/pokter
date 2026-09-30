import assert from 'node:assert/strict';
import test from 'node:test';

import { isPromotableAgent } from '../src/lib/agents/eligibility';

test('ordinary production agents may be promoted', () => {
  assert.equal(
    isPromotableAgent({
      name: 'Treasury Sentinel',
      description: 'Monitors treasury positions and returns signed reports.',
    }),
    true,
  );
});

test('explicit test deployments stay out of recommendation surfaces', () => {
  assert.equal(
    isPromotableAgent({
      name: 'BNB Grid Trader (test)',
      description: 'TEST DEPLOYMENT — not for production use.',
    }),
    false,
  );
});

test('retired duplicates stay visible in the catalog but are not promoted', () => {
  assert.equal(
    isPromotableAgent({
      name: 'Yield Router',
      description: 'Retired duplicate of the current production identity.',
    }),
    false,
  );
});

test('publisher markers are matched case-insensitively', () => {
  assert.equal(
    isPromotableAgent({ name: 'Old agent', description: 'Not For Production' }),
    false,
  );
});
