import assert from 'node:assert/strict';
import test from 'node:test';

import { conversionField, isConversionEvent, stoppedHireEvent } from '../src/lib/conversion/funnel';

test('a hire the agent turned down is counted apart from one that broke', () => {
  assert.equal(stoppedHireEvent('seller'), 'hire_refused');
  for (const layer of ['protocol', 'network', 'payment', 'terms']) assert.equal(stoppedHireEvent(layer), 'hire_failed', layer);
});

test("the buyer's own choices are not counted as failures", () => {
  assert.equal(stoppedHireEvent('wallet'), null);
  assert.equal(stoppedHireEvent('input'), null);
  assert.equal(stoppedHireEvent(null), null);
});

test('the new events are accepted and stored under their own counts', () => {
  assert.equal(isConversionEvent('hire_refused'), true);
  assert.equal(conversionField('hire_refused'), 'hireRefused');
  assert.equal(conversionField('hire_failed'), 'hireFailed');
  assert.equal(conversionField('funded'), 'funded', 'funded no longer the catch-all for unknown events');
});
