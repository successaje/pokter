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
test('eligibility is measured from the announcement, not the window start', async () => {
  const { registeredInCampaign, CAMPAIGN_STARTS_AT, PHASE_2_ANNOUNCED_AT } =
    await import('../src/lib/campaign/window');
  const start = PHASE_2_ANNOUNCED_AT.getTime();

  /*
   * The rules exclude agents listed before the announcement on X, which
   * came a day after the window opened. Testing against the window start
   * would pass an agent registered on 1 October that the rules reject.
   */
  assert.ok(
    PHASE_2_ANNOUNCED_AT.getTime() > CAMPAIGN_STARTS_AT.getTime(),
    'the announcement is after the window opens',
  );
  assert.equal(
    registeredInCampaign(CAMPAIGN_STARTS_AT.toISOString()),
    false,
    'registered when the window opened, but before the announcement',
  );

  assert.equal(registeredInCampaign(new Date(start).toISOString()), true, 'the announcement moment itself counts');
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

/*
 * Explorer links are evidence on this product, so a broken one is worse
 * than no link: a reader who follows it to check a claim and finds nothing
 * has been handed a reason to doubt the claim by us.
 *
 * The bug was one base for two chains — the escrow explorer, testnet, used
 * for registry records and attestations that live on the agent's chain.
 */
test('an explorer link goes to the chain the thing is actually on', async () => {
  const { explorerBaseFor } = await import('../src/lib/network/presentation');

  assert.equal(explorerBaseFor(56), 'https://bscscan.com');
  assert.equal(explorerBaseFor(97), 'https://testnet.bscscan.com');
  assert.notEqual(
    explorerBaseFor(56),
    explorerBaseFor(97),
    'mainnet and testnet must not share an explorer',
  );
  // An unknown chain still yields a usable URL rather than a broken one.
  assert.match(explorerBaseFor(1), /^https:\/\//);
});
