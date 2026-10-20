import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';

import { acceptsProposals, awardMessage, bidMessage, briefMessage, hireTaskFromRequest, listProblem, readBidContent, readBriefContent, REQUEST_CATEGORIES, requestCategoryLabel, requestCategoryOf, withdrawMessage, withinBudget } from '../src/lib/briefs/model';

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

test('a closing date is signed when set, and a request without one signs what it always did', () => {
  const before = [
    'Pokter posted brief',
    `Posted by: ${POSTER.toLowerCase()}`,
    `At: ${AT}`,
    'Title: Route planner',
    'Budget: 2.5 $U on chain 97',
    'Deliver within: 7 days',
    'Brief: Plan crew routes and find schedule gaps.',
    'Acceptance: Every job assigned or explained',
    'Fail signals: A message is sent instead of drafted',
  ].join('\n');
  // Requests posted before closing dates existed must still verify.
  assert.equal(briefMessage({ ...CONTENT, poster: POSTER, postedAt: AT }), before);
  assert.equal(briefMessage({ ...CONTENT, closesAt: null, poster: POSTER, postedAt: AT }), before);
  const closing = briefMessage({ ...CONTENT, closesAt: '2026-10-26T10:00:00.000Z', poster: POSTER, postedAt: AT });
  assert.equal(closing, `${before}\nProposals close: 2026-10-26T10:00:00.000Z`);
});

test('a closing date must be ahead, and not so far ahead the request is open in name only', () => {
  const now = Date.parse(AT);
  const day = 86_400_000;
  assert.equal(readBriefContent({ ...CONTENT, closesAt: new Date(now - day).toISOString() }, now), null);
  assert.equal(readBriefContent({ ...CONTENT, closesAt: new Date(now + 61 * day).toISOString() }, now), null);
  assert.equal(readBriefContent({ ...CONTENT, closesAt: 'next week' }, now), null);
  const week = new Date(now + 7 * day).toISOString();
  assert.equal(readBriefContent({ ...CONTENT, closesAt: week }, now)?.closesAt, week, 'kept exactly as signed');
  assert.equal(readBriefContent(CONTENT, now)?.closesAt, null);
});

test('proposals are taken while a request is open and before it closes', () => {
  const now = Date.parse(AT);
  assert.equal(acceptsProposals({ state: 'open', closesAt: null }, now), true);
  assert.equal(acceptsProposals({ state: 'open', closesAt: new Date(now + 1000).toISOString() }, now), true);
  assert.equal(acceptsProposals({ state: 'open', closesAt: new Date(now - 1000).toISOString() }, now), false);
  assert.equal(acceptsProposals({ state: 'awarded', closesAt: null }, now), false);
  assert.equal(acceptsProposals({ state: 'cancelled', closesAt: null }, now), false);
});

test('a withdrawal names the request and its poster, and nothing else verifies for it', () => {
  assert.notEqual(withdrawMessage('b1', POSTER), withdrawMessage('b2', POSTER));
  assert.equal(withdrawMessage('b1', POSTER), withdrawMessage('b1', POSTER.toLowerCase()));
  assert.notEqual(withdrawMessage('b1', POSTER), awardMessage('b1', 'b1', POSTER));
});

test('the hire carries what a delivery is held to, even when the description has to be cut', () => {
  const task = hireTaskFromRequest(CONTENT);
  assert.equal(
    task,
    'Plan crew routes and find schedule gaps.\n\nDone when:\n- Every job assigned or explained\n\nRejected if:\n- A message is sent instead of drafted',
  );
  const long = hireTaskFromRequest({ ...CONTENT, brief: 'x'.repeat(4000) });
  assert.ok(long.length <= 2000, 'fits the hire form');
  assert.ok(long.includes('- Every job assigned or explained'), 'the criteria survive');
  assert.ok(long.includes('- A message is sent instead of drafted'));
});

test('a category is signed when chosen, and only one of the board’s is accepted', () => {
  const plain = briefMessage({ ...CONTENT, poster: POSTER, postedAt: AT });
  assert.equal(briefMessage({ ...CONTENT, category: null, poster: POSTER, postedAt: AT }), plain);
  assert.equal(briefMessage({ ...CONTENT, category: 'yield', poster: POSTER, postedAt: AT }), `${plain}\nCategory: yield`);
  assert.equal(readBriefContent({ ...CONTENT, category: 'yield' })?.category, 'yield');
  assert.equal(readBriefContent({ ...CONTENT, category: 'gambling' }), null);
  assert.equal(readBriefContent(CONTENT)?.category, null);
});

test('a budget or a proposal above what one hire can be funded with is refused', () => {
  // A request priced past the hire limit could be chosen and then never funded.
  assert.equal(readBriefContent({ ...CONTENT, budgetU: 5 })?.budgetU, 5);
  assert.equal(readBriefContent({ ...CONTENT, budgetU: 5.01 }), null);
  assert.equal(readBriefContent({ ...CONTENT, budgetU: 0.001 }), null);
  const ok = { agentChainId: 97, agentTokenId: '2554', priceU: 5, deliverDays: 3, note: '' };
  assert.ok(readBidContent(ok));
  assert.equal(readBidContent({ ...ok, priceU: 25 }), null);
});

test('a list the server would trim is caught before it is signed', () => {
  // The signature covers the text as written; a trimmed copy would not verify.
  assert.equal(listProblem(['fine']), null);
  assert.match(listProblem(Array.from({ length: 13 }, (_, i) => `line ${i}`)) ?? '', /12 lines/);
  assert.match(listProblem(['x'.repeat(241)]) ?? '', /240 characters/);
});

test('request categories are the agent categories, plus one for none of them', () => {
  assert.deepEqual(
    REQUEST_CATEGORIES.map((c) => c.id),
    ['rebalancing', 'grid-trading', 'yield', 'health-factor', 'token-safety', 'none'],
  );
  assert.equal(requestCategoryLabel('grid-trading'), 'Grid Trading');
  assert.equal(requestCategoryLabel('none'), null, 'no tag for "something else"');
});

test('a request signed with an earlier category id keeps it, and reads as today’s category', () => {
  // The id is part of the signed text, so it is stored as sent; only labels and filters map it.
  const legacy = readBriefContent({ ...CONTENT, category: 'lending-risk' });
  assert.equal(legacy?.category, 'lending-risk');
  assert.equal(
    briefMessage({ ...CONTENT, category: 'lending-risk', poster: POSTER, postedAt: AT }).endsWith('Category: lending-risk'),
    true,
  );
  assert.equal(requestCategoryOf('lending-risk'), 'health-factor');
  assert.equal(requestCategoryOf('portfolio'), 'rebalancing');
  assert.equal(requestCategoryOf('research'), 'none');
  assert.equal(requestCategoryLabel('lending-risk'), 'Health Factor');
  assert.equal(requestCategoryOf('gambling'), null);
});

test('a proposal may not ask more than the request’s budget', () => {
  // The budget is what the poster said they would fund; a higher price is one they already declined.
  assert.equal(withinBudget(2.5, 2.5), true);
  assert.equal(withinBudget(1, 2.5), true);
  assert.equal(withinBudget(2.51, 2.5), false);
  assert.equal(withinBudget(0.1 + 0.2, 0.3), true, 'compared to the cent, not to float noise');
  assert.equal(withinBudget(Number.NaN, 2.5), false);
});
