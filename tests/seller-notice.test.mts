import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_DELIVERABLE_URL, statedDeliverableUrl } from '../src/lib/erc8183/stated-url';

/**
 * The seller hands Pokter the deliverable URL when it accepts the job.
 * The same URL is on chain in the submission's optParams, but reading it
 * back needs eth_getLogs over the block it landed in, and no free BNB
 * Chain endpoint serves that history for long — publicnode answers about
 * eight thousand blocks, under two hours, and the dataseed endpoints
 * refuse log queries outright. Keeping what the seller said is the only
 * reliable path, which makes this parsing load-bearing for every receipt
 * verified more than a couple of hours after delivery.
 */

test('the stated URL is kept', () => {
  assert.equal(
    statedDeliverableUrl({ status: 'accepted', deliverable_url: 'https://agent.brainonbnb.com/job/57001/result' }),
    'https://agent.brainonbnb.com/job/57001/result',
  );
});

test('both spellings a seller might use are read', () => {
  const url = 'https://example.com/job/1/result';
  assert.equal(statedDeliverableUrl({ deliverable_url: url }), url);
  assert.equal(statedDeliverableUrl({ deliverableUrl: url }), url);
});

test('a URL that is not https is refused', () => {
  // Somebody else's string on its way into Pokter's index and onto a
  // buyer's screen; plaintext and odd schemes have no business there.
  for (const bad of ['http://example.com/r', 'javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/r']) {
    assert.equal(statedDeliverableUrl({ deliverable_url: bad }), null, `${bad} should be refused`);
  }
});

test('anything that is not a usable string is no URL', () => {
  for (const bad of [undefined, null, 42, {}, [], true, 'not a url', '']) {
    assert.equal(statedDeliverableUrl({ deliverable_url: bad }), null);
  }
  assert.equal(statedDeliverableUrl({}), null);
});

test('surrounding whitespace does not defeat it', () => {
  assert.equal(statedDeliverableUrl({ deliverable_url: '  https://example.com/r  ' }), 'https://example.com/r');
});

test('an absurdly long URL is refused, not trimmed', () => {
  // Trimming would store a different URL that happens to be shorter, and
  // a buyer would be sent to it. Refusing leaves the chain copy as the
  // only claim, which is at least honest.
  const long = `https://example.com/${'x'.repeat(900)}`;
  assert.equal(statedDeliverableUrl({ deliverable_url: long }), null);
  const atLimit = `https://example.com/${'x'.repeat(MAX_DELIVERABLE_URL - 20)}`;
  assert.equal(statedDeliverableUrl({ deliverable_url: atLimit })?.length, MAX_DELIVERABLE_URL);
});
