import assert from 'node:assert/strict';
import test from 'node:test';

import { CONVERSION_EVENTS, conversionField, emptyConversionCounts, isConversionEvent } from '../src/lib/conversion/funnel';

test('only the four disclosed buyer-funnel events are accepted', () => {
  assert.deepEqual(CONVERSION_EVENTS, ['listing_viewed', 'hire_opened', 'wallet_connected', 'funded']);
  for (const event of CONVERSION_EVENTS) assert.equal(isConversionEvent(event), true);
  assert.equal(isConversionEvent('wallet_address'), false);
  assert.equal(isConversionEvent('task_text'), false);
});

test('conversion events map to explicit aggregate fields', () => {
  assert.equal(conversionField('listing_viewed'), 'listingViewed');
  assert.equal(conversionField('hire_opened'), 'hireOpened');
  assert.equal(conversionField('wallet_connected'), 'walletConnected');
  assert.equal(conversionField('funded'), 'funded');
  assert.deepEqual(emptyConversionCounts(), { listingViewed: 0, hireOpened: 0, walletConnected: 0, funded: 0, firstObservedDay: null });
});
