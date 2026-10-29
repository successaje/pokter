import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { requestStatus } from '../src/lib/briefs/model';
import { CLOSING_OPTIONS, DELIVERY_OPTIONS, draftFromRequest } from '../src/lib/briefs/request-draft';

/*
 * Posting a request again. A request that closed or was withdrawn without
 * a hire opens the form with everything it said, so the poster checks and
 * signs it as a new request instead of retyping it.
 */

const USDT56 = '0x55d398326f99059fF775485246999027B3197955' as const;
const REQUEST = {
  title: 'Health factor',
  brief: 'Report the health factor for my Venus position.',
  acceptance: ['Gives the number', 'Names the block'],
  failSignals: ['Estimates instead of reading the chain'],
  budgetU: 1.5,
  paymentToken: USDT56,
  chainId: 56,
  deliverDays: 3,
  postedAt: '2026-10-01T12:00:00.000Z',
  closesAt: '2026-10-08T12:00:00.000Z',
  category: 'health-factor',
};

test('everything the poster wrote is carried over, one line per criterion', () => {
  const draft = draftFromRequest(REQUEST);
  assert.equal(draft.title, 'Health factor');
  assert.equal(draft.brief, REQUEST.brief);
  assert.equal(draft.acceptance, 'Gives the number\nNames the block');
  assert.equal(draft.failSignals, 'Estimates instead of reading the chain');
  assert.equal(draft.budget, '1.5');
  assert.equal(draft.chainId, 56);
  assert.equal(draft.paymentToken, USDT56, 'the same money, not the network default');
  assert.equal(draft.deliverDays, 3);
  assert.equal(draft.category, 'health-factor');
});

test('the proposal window is the original one, counted again from publishing', () => {
  assert.equal(draftFromRequest(REQUEST).closesInDays, 7);
  assert.equal(draftFromRequest({ ...REQUEST, closesAt: null }).closesInDays, 0, 'open until chosen stays so');
  assert.equal(draftFromRequest({ ...REQUEST, closesAt: '2026-10-05T12:00:00.000Z' }).closesInDays, 7, 'four days is offered as seven, never fewer');
  assert.equal(draftFromRequest({ ...REQUEST, closesAt: '2026-12-31T12:00:00.000Z' }).closesInDays, 30, 'longer than any option is the longest');
});

test('a value the form does not offer becomes one it does, never less time', () => {
  assert.equal(draftFromRequest({ ...REQUEST, deliverDays: 4 }).deliverDays, 5);
  assert.equal(draftFromRequest({ ...REQUEST, deliverDays: 30 }).deliverDays, 30);
  const draft = draftFromRequest({ ...REQUEST, deliverDays: 6, closesAt: '2026-10-03T00:00:00.000Z' });
  assert.ok(DELIVERY_OPTIONS.includes(draft.deliverDays));
  assert.ok(CLOSING_OPTIONS.includes(draft.closesInDays));
});

test('a legacy request keeps its $U and its category in the current names', () => {
  const draft = draftFromRequest({ ...REQUEST, paymentToken: null, category: null });
  assert.equal(draft.paymentToken, null, 'null is the chain’s $U, which the form reads as such');
  assert.equal(draft.category, null);
});

test('only a request that ended without a hire is offered again', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  assert.equal(requestStatus({ state: 'open', closesAt: '2026-10-08T12:00:00.000Z' }, now).tone, 'ended', 'past its closing date');
  assert.equal(requestStatus({ state: 'cancelled', closesAt: null }, now).tone, 'ended');
  assert.equal(requestStatus({ state: 'open', closesAt: null }, now).tone, 'open');
  assert.equal(requestStatus({ state: 'awarded', closesAt: null }, now).tone, 'chosen');
});

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the request page and My requests link an ended request to a filled-in form', () => {
  assert.match(source('src/app/(site)/requests/[id]/page.tsx'), /ended=\{said\.tone === 'ended'\}/);
  const detail = source('src/features/briefs/RequestDetail.tsx');
  assert.match(detail, /isPoster && ended \?/);
  assert.match(detail, /\/workspace\/requests\/new\?from=\$\{request\.id\}/);
  const mine = source('src/features/workspace/PostedRequests.tsx');
  assert.match(mine, /const status = requestStatus\(request\)/, 'an expired request is not called open');
  assert.match(mine, /status\.tone === 'ended' && \(\s*<Link href=\{`\/workspace\/requests\/new\?from=\$\{request\.id\}`\}/);
  const page = source('src/app/(site)/workspace/requests/new/page.tsx');
  assert.match(page, /draft: draftFromRequest\(source\)/);
});

test('a copy is signed as a new request and leaves a saved draft alone', () => {
  const form = source('src/features/briefs/RequestForm.tsx');
  assert.match(form, /if \(copy\) \{\s*\/\*[^]*?\*\/\s*if \(moreOptions\.current\) moreOptions\.current\.open = true;\s*return;/, 'not replaced by the saved draft, and the window is in view');
  assert.match(form, /if \(ownsDraft\) window\.localStorage\.removeItem\(DRAFT_KEY\)/, 'publishing a copy does not delete unrelated work');
  assert.match(form, /briefMessage\(\{ \.\.\.terms, poster: address, postedAt \}\)/, 'a fresh signature over fresh dates');
});
