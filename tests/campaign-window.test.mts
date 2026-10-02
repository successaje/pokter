import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_END_LABEL,
  CAMPAIGN_ENDS_AT,
  isCampaignLive,
} from '../src/lib/campaign/window';

/*
 * The deadline was a string in two components with no logic behind it, so the
 * banners would have gone on saying "Set and Earn is live … Ends 5 Nov" after
 * 5 November. These pin the behaviour that replaced it.
 */
test('the campaign closes at its published moment, not before', () => {
  const end = CAMPAIGN_ENDS_AT.getTime();
  assert.equal(isCampaignLive(new Date(end - 1000)), true);
  assert.equal(isCampaignLive(new Date(end)), true, 'the deadline is inclusive');
  assert.equal(isCampaignLive(new Date(end + 1000)), false);
  assert.equal(isCampaignLive(new Date('2026-11-06T00:00:00Z')), false);
});

test('the label is derived from the timestamp and fixed to UTC', () => {
  // The exact wording the banners used to hardcode, so the swap is lossless.
  assert.equal(CAMPAIGN_END_LABEL, 'Ends 5 Nov · 12:00 UTC');
});
