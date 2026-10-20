import assert from 'node:assert/strict';
import test from 'node:test';

import { matchRequests, type MatchableRequest } from '../src/lib/briefs/matching';
import { alertCopy } from '../src/lib/briefs/request-alerts';

/*
 * Which open requests a builder is told about. Category is the whole test:
 * it is the one claim both the poster and the builder made themselves.
 */

const ME = '0xAbC0000000000000000000000000000000000001';
const NOW = Date.parse('2026-10-20T12:00:00Z');
const request = (over: Partial<MatchableRequest> = {}): MatchableRequest => ({
  id: 'r1',
  title: 'Check how close a Venus loan is to liquidation',
  poster: '0x9990000000000000000000000000000000000009',
  state: 'open',
  closesAt: null,
  category: 'health-factor',
  budgetU: 0.1,
  chainId: 97,
  postedAt: '2026-10-20T10:00:00Z',
  ...over,
});
const brinkwatch = { chainId: 97, tokenId: '2618', name: 'Brinkwatch', categoryId: 'health-factor' };
const gridAgent = { chainId: 97, tokenId: '9', name: 'Gridder', categoryId: 'grid-trading' };

test('a request in a category one of my agents is listed under matches, naming that agent', () => {
  const [match] = matchRequests([request()], [gridAgent, brinkwatch], ME, NOW);
  assert.equal(match.request.id, 'r1');
  assert.deepEqual(match.agents.map((a) => a.name), ['Brinkwatch']);
});

test('nothing matches outside my agents’ categories, or in "Something else"', () => {
  assert.deepEqual(matchRequests([request({ category: 'yield' })], [brinkwatch], ME, NOW), []);
  assert.deepEqual(matchRequests([request({ category: 'none' })], [{ ...brinkwatch, categoryId: 'none' }], ME, NOW), []);
  assert.deepEqual(matchRequests([request({ category: null })], [brinkwatch], ME, NOW), []);
});

test('a legacy category id matches the category it now means', () => {
  assert.equal(matchRequests([request({ category: 'lending-risk' })], [brinkwatch], ME, NOW).length, 1);
});

test('my own requests, and ones no longer taking proposals, are left out', () => {
  assert.deepEqual(matchRequests([request({ poster: ME.toLowerCase() })], [brinkwatch], ME, NOW), []);
  assert.deepEqual(matchRequests([request({ state: 'awarded' })], [brinkwatch], ME, NOW), []);
  assert.deepEqual(matchRequests([request({ state: 'cancelled' })], [brinkwatch], ME, NOW), []);
  assert.deepEqual(matchRequests([request({ closesAt: '2026-10-20T11:00:00Z' })], [brinkwatch], ME, NOW), []);
});

test('the alert says what was asked, for how much, in which money, and which agent fits', () => {
  const one = alertCopy({ request: request(), agents: [brinkwatch] });
  assert.equal(one.body, '“Check how close a Venus loan is to liquidation” · up to 0.10 test $U. Brinkwatch fits its category.');
  const two = alertCopy({ request: request({ chainId: 56, budgetU: 2 }), agents: [brinkwatch, { ...brinkwatch, name: 'Other' }] });
  assert.match(two.body, /up to 2\.00 \$U\. Brinkwatch and 1 more of your agents fit/);
});
