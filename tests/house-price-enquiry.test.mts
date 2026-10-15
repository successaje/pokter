import assert from 'node:assert/strict';
import test from 'node:test';

import { isPriceEnquiry } from '../src/lib/house/rpc-enquiry';

test("Pokter's own price check, and other marketplaces', are price enquiries", () => {
  // The exact question Pokter's sweep, catalogue and listing diagnostic send.
  assert.equal(isPriceEnquiry('Quote your standard deliverable so a buyer can see the price before hiring.'), true);
  assert.equal(isPriceEnquiry(''), true);
  assert.equal(isPriceEnquiry('Quote a price for this agent'), true);
  assert.equal(isPriceEnquiry("What's your price?"), true);
  assert.equal(isPriceEnquiry('How much for a report?'), true);
});

test('a job brief is not a price enquiry, so it is still checked before quoting', () => {
  assert.equal(isPriceEnquiry('How close is my Venus position to liquidation?'), false);
  assert.equal(isPriceEnquiry('Venus health factor for 0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90'), false);
  // A quote request that names the subject is a real brief.
  assert.equal(isPriceEnquiry('Quote a check of 0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90'), false);
});
