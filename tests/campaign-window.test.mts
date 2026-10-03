import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_END_LABEL,
  CAMPAIGN_ENDS_AT,
  isCampaignLive,
  registeredInCampaign,
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

/*
 * The campaign does not count agents listed before it started. Today that
 * is 77 of the 79 listed, so the distinction decides whether a builder's
 * existing agent can qualify at all or whether they need a new one.
 */
test('registration is inside the window only from the start date', async () => {
  const { registeredInCampaign, CAMPAIGN_STARTS_AT } = await import(
    '../src/lib/campaign/window'
  );
  const start = CAMPAIGN_STARTS_AT.getTime();

  assert.equal(registeredInCampaign(new Date(start).toISOString()), true, 'the start itself counts');
  assert.equal(registeredInCampaign(new Date(start + 86_400_000).toISOString()), true);
  assert.equal(registeredInCampaign(new Date(start - 1000).toISOString()), false);
  assert.equal(registeredInCampaign('2026-09-12T10:00:00Z'), false);
});

test('a missing or unreadable date is unknown, not ineligible', () => {
  for (const value of [null, undefined, '', 'not a date']) {
    assert.equal(
      registeredInCampaign(value as string | null),
      null,
      `${JSON.stringify(value)} should be unknown`,
    );
  }
});
