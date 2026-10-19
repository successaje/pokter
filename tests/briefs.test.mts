import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';

import { awardMessage, bidMessage, briefMessage, readBidContent, readBriefContent } from '../src/lib/briefs/model';

/*
 * A brief is a set of terms somebody will be held to, so the signature has
 * to cover the terms and not merely the fact that a brief was posted. These
 * pin that: change any field a bidder reads and the signature stops
 * matching.
 */

const CONTENT = {
  title: 'Route planner',
  brief: 'Plan crew routes and find schedule gaps.',
  acceptance: ['Every job assigned or explained'],
  failSignals: ['A message is sent instead of drafted'],
  budgetU: 2.5,
  chainId: 97,
  deliverDays: 7,
};
const POSTER = '0x60eF148485c2a5119fa52ca13c52E9Fd98f28E87';
const AT = '2026-10-19T10:00:00.000Z';

test('the signed message covers every term a bidder prices against', () => {
  const base = briefMessage({ ...CONTENT, poster: POSTER, postedAt: AT });
  const changed = [
    { ...CONTENT, budgetU: 999 },
    { ...CONTENT, deliverDays: 1 },
    { ...CONTENT, acceptance: ['anything at all'] },
    { ...CONTENT, failSignals: [] },
    { ...CONTENT, brief: 'something else' },
    { ...CONTENT, chainId: 56 },
  ];
  for (const content of changed) {
    assert.notEqual(briefMessage({ ...content, poster: POSTER, postedAt: AT }), base);
  }
});

test('the poster is compared in one case, so the same wallet signs one message', () => {
  assert.equal(
    briefMessage({ ...CONTENT, poster: POSTER, postedAt: AT }),
    briefMessage({ ...CONTENT, poster: POSTER.toLowerCase(), postedAt: AT }),
  );
});

test('a real signature verifies, and a changed budget does not', async () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const message = briefMessage({ ...CONTENT, poster: account.address, postedAt: AT });
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  const tampered = briefMessage({ ...CONTENT, budgetU: 999, poster: account.address, postedAt: AT });
  assert.equal(await verifyMessage({ address: account.address, message: tampered, signature }), false);
});

test('a bid binds the agent, the price and the brief it answers', () => {
  const bid = { agentChainId: 97, agentTokenId: '2554', priceU: 2, deliverDays: 5, note: 'n' };
  const base = bidMessage({ ...bid, briefId: 'b1', bidder: POSTER, placedAt: AT });
  assert.notEqual(bidMessage({ ...bid, briefId: 'b2', bidder: POSTER, placedAt: AT }), base, 'a bid cannot be replayed onto another brief');
  assert.notEqual(bidMessage({ ...bid, priceU: 1, briefId: 'b1', bidder: POSTER, placedAt: AT }), base);
  assert.notEqual(bidMessage({ ...bid, agentTokenId: '1', briefId: 'b1', bidder: POSTER, placedAt: AT }), base);
});

test('an award names both the brief and the bid', () => {
  assert.notEqual(awardMessage('b1', 'x', POSTER), awardMessage('b1', 'y', POSTER));
  assert.notEqual(awardMessage('b1', 'x', POSTER), awardMessage('b2', 'x', POSTER));
});

test('a brief without acceptance criteria is refused', () => {
  // The field this board exists for: a budget and a paragraph is a wish.
  assert.equal(readBriefContent({ ...CONTENT, acceptance: [] }), null);
  assert.equal(readBriefContent({ ...CONTENT, acceptance: ['  '] }), null);
  assert.ok(readBriefContent(CONTENT));
});

test('a brief is refused on a chain with no escrow, and on an impossible budget', () => {
  assert.equal(readBriefContent({ ...CONTENT, chainId: 1 }), null);
  assert.equal(readBriefContent({ ...CONTENT, budgetU: 0 }), null);
  assert.equal(readBriefContent({ ...CONTENT, budgetU: -5 }), null);
  assert.equal(readBriefContent({ ...CONTENT, deliverDays: 0 }), null);
});

test('a bid names an agent that could exist', () => {
  const ok = { agentChainId: 97, agentTokenId: '2554', priceU: 1, deliverDays: 3, note: '' };
  assert.ok(readBidContent(ok));
  assert.equal(readBidContent({ ...ok, agentTokenId: 'not-a-token' }), null);
  assert.equal(readBidContent({ ...ok, agentChainId: 1 }), null);
  assert.equal(readBidContent({ ...ok, priceU: 0 }), null);
});
