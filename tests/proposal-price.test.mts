import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { awardMessage, reopenMessage } from '../src/lib/briefs/model';
import { belowSignedPrice, belowSignedPriceMessage, SIGNED_PRICE_FRESH_MS } from '../src/lib/briefs/price-floor';

/*
 * A proposal below the price its agent signs could be chosen and never
 * funded: the hire asks the agent for a fresh signed price and refuses one
 * above the proposal. These pin the comparison, where it is enforced, and
 * the way back for a poster who chose such a proposal.
 */

const TEST_U = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const USDT97 = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const NOW = Date.parse('2026-10-29T12:00:00Z');
const proposal = { priceRaw: '50000000000000000', paymentToken: TEST_U };
const signed = { priceRaw: '100000000000000000', currency: TEST_U.toLowerCase(), quotedAt: '2026-10-28T12:00:00Z' };

test('a proposal under the signed price in the same token is below it; at or over it is not', () => {
  assert.equal(belowSignedPrice(proposal, signed, { now: NOW }), true);
  assert.equal(belowSignedPrice({ ...proposal, priceRaw: signed.priceRaw }, signed, { now: NOW }), false, 'equal is fundable');
  assert.equal(belowSignedPrice({ ...proposal, priceRaw: '200000000000000000' }, signed, { now: NOW }), false);
});

test('compared exactly in base units, not as rounded numbers', () => {
  assert.equal(belowSignedPrice({ ...proposal, priceRaw: '99999999999999999' }, signed, { now: NOW }), true);
});

test('a price in another token, unreadable, or missing says nothing either way', () => {
  assert.equal(belowSignedPrice(proposal, { ...signed, currency: USDT97 }, { now: NOW }), false);
  assert.equal(belowSignedPrice(proposal, { ...signed, priceRaw: 'abc' }, { now: NOW }), false);
  assert.equal(belowSignedPrice(proposal, { ...signed, priceRaw: null }, { now: NOW }), false);
  assert.equal(belowSignedPrice(proposal, { ...signed, currency: null }, { now: NOW }), false);
  assert.equal(belowSignedPrice(proposal, null, { now: NOW }), false);
  assert.equal(belowSignedPrice({ ...proposal, paymentToken: null }, signed, { now: NOW }), false);
});

test('a stale signed price is not held against a new proposal, but still flags an existing one', () => {
  const old = { ...signed, quotedAt: new Date(NOW - SIGNED_PRICE_FRESH_MS - 1).toISOString() };
  assert.equal(belowSignedPrice(proposal, old, { now: NOW, freshOnly: true }), false, 'the agent may have lowered it since');
  assert.equal(belowSignedPrice(proposal, signed, { now: NOW, freshOnly: true }), true);
  assert.equal(belowSignedPrice(proposal, old, { now: NOW }), true);
});

test('the refusal names the price and what to do about it', () => {
  const message = belowSignedPriceMessage('0.1 $U');
  assert.match(message, /signs 0\.1 \$U for a job/);
  assert.match(message, /Propose at least 0\.1 \$U, or lower the price the agent signs first\./);
});

test('changing a choice is its own signed, dated message, distinct from any award', () => {
  const poster = '0x60eF148485c2a5119fa52ca13c52E9Fd98f28E87';
  const at = '2026-10-29T12:00:00.000Z';
  const base = reopenMessage('r1', 'p1', poster, at);
  assert.notEqual(base, awardMessage('r1', 'p1', poster));
  assert.notEqual(base, reopenMessage('r1', 'p2', poster, at));
  assert.notEqual(base, reopenMessage('r2', 'p1', poster, at));
  assert.notEqual(base, reopenMessage('r1', 'p1', poster, '2026-10-29T12:01:00.000Z'), 'dated, so it cannot be replayed later');
  assert.equal(base, reopenMessage('r1', 'p1', poster.toLowerCase(), at));
});

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('every way of proposing refuses a price below a fresh signed one, before the registry is asked', () => {
  const bids = source('src/app/api/briefs/[id]/bids/route.ts');
  assert.match(bids, /belowSignedPrice\(content, signed, \{ freshOnly: true \}\)/);
  assert.ok(bids.indexOf('belowSignedPrice(content') < bids.indexOf('await registryOwner('), 'refused before any network call');
  const mcp = source('src/app/api/mcp/route.ts');
  assert.match(mcp, /belowSignedPrice\(parsed\.content, signedNow, \{ freshOnly: true \}\)/);
  assert.ok(mcp.indexOf('belowSignedPrice(parsed.content') < mcp.indexOf('await registryOwner(c, t)'));
});

test('a choice is changed only by the poster, freshly signed, and never once funded', () => {
  const route = source('src/app/api/briefs/[id]/reopen/route.ts');
  const order = ['decisionIsFresh(decidedAt)', 'requestHired(brief', 'signedByWallet(brief.chainId', 'store.reopen(id, brief.awardedBidId)'].map((needle) => route.indexOf(needle));
  assert.ok(order.every((at) => at > 0), 'each check is present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in that order');
});

test('the chosen card offers the change, and a below-price card says it cannot be funded', () => {
  const list = source('src/features/briefs/ProposalList.tsx');
  assert.match(list, /<ChangeChoice briefId=\{request\.id\} bidId=\{bid\.id\} poster=\{request\.poster\} \/>/);
  assert.match(list, /this agent last signed, so it cannot be funded at this price/);
  const actions = source('src/features/briefs/BriefActions.tsx');
  assert.match(actions, /reopenMessage\(briefId, bidId, poster, decidedAt\)/);
  assert.match(actions, /\/api\/briefs\/\$\{briefId\}\/reopen/);
});

test('the hire page sends a poster stopped by the price back to change their choice', () => {
  const flow = source('src/features/hire/HireFlow.tsx');
  assert.match(flow, /so this proposal cannot be funded\. Go back to the request and change your choice/);
  assert.match(source('src/lib/hire/useHire.ts'), /Go back to the request and change your choice\./);
});
