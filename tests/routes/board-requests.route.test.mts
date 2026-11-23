import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { getAddress, type Address, type Hex } from 'viem';

import type { Brief } from '../../src/lib/briefs/model';

/*
 * A request on PokterBoard as Pokter keeps and offers it: the post is
 * stored once, and closed once; its poster is offered to post an open
 * request only while their wallet holds an Agent ID and the board would
 * take it, and to close the post once the request stops taking proposals.
 */

process.env.BRIEF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-board-requests-')), 'briefs.db');
const { getBriefStore } = await import('../../src/lib/briefs/store');
const { boardRequestStatus } = await import('../../src/lib/board/request-server');
const { requestBriefHash } = await import('../../src/lib/board/requests');

const BOARD: Address = getAddress('0x00000000000000000000000000000000000b0a2d');
const POSTER: Address = getAddress('0x564cbb1c360af36681591f47af469913b6364431');
const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const TX = (b: string) => `0x${b.repeat(32)}` as Hex;

const request = (id: string, over: Partial<Brief> = {}): Brief => ({
  id,
  poster: POSTER,
  signature: '0x01',
  state: 'open',
  postedAt: '2026-11-24T11:00:00.000Z',
  awardedBidId: null,
  title: 'Check a token before I buy it',
  brief: 'Tell me whether CAKE is safe to buy, with the sources you read.',
  acceptance: ['Names every owner power it found'],
  failSignals: ['A verdict without sources'],
  budgetU: 0.05,
  paymentToken: null,
  budgetRaw: '50000000000000000',
  chainId: 56,
  deliverDays: 2,
  closesAt: null,
  category: 'token-safety',
  targetBuilder: null,
  ...over,
});

test('a post is stored once and a close once, and the request reads them back', () => {
  const store = getBriefStore();
  store.add(request('11111111-1111-4111-8111-111111111111'));
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(store.get(id)?.board, null);
  assert.equal(store.recordBoardClose(id, TX('cc')), false, 'nothing to close before a post');
  assert.equal(store.recordBoardPost(id, { requestId: '7', tx: TX('aa'), expiresAt: '2026-12-24T12:00:00.000Z' }), true);
  assert.equal(store.recordBoardPost(id, { requestId: '9', tx: TX('bb'), expiresAt: '2026-12-25T12:00:00.000Z' }), false, 'a second post of the same text keeps the first');
  assert.deepEqual(store.get(id)?.board, { requestId: '7', tx: TX('aa'), expiresAt: '2026-12-24T12:00:00.000Z', closedTx: null });
  assert.equal(store.recordBoardClose(id, TX('cc')), true);
  assert.equal(store.recordBoardClose(id, TX('dd')), false);
  assert.equal(store.get(id)?.board?.closedTx, TX('cc'));
});

const never = async () => {
  throw new Error('not asked');
};

test('without a board, nothing is offered', async () => {
  assert.deepEqual(await boardRequestStatus(request('a'), null, { holds: never, simulate: never, now: NOW }), { available: false });
});

test('an open request is offered to its poster only when their wallet holds an Agent ID and the board would take it', async () => {
  const notHolder = await boardRequestStatus(request('a'), BOARD, { holds: async () => false, simulate: never, now: NOW });
  assert.equal(notHolder.available && !notHolder.posted && notHolder.eligible, false);
  assert.equal(notHolder.available && !notHolder.posted ? notHolder.holder : null, false);

  const ok = await boardRequestStatus(request('a'), BOARD, { holds: async () => true, simulate: async () => ({ ok: true }), now: NOW });
  assert.ok(ok.available && !ok.posted && ok.eligible);
  assert.equal(ok.call?.briefHash, requestBriefHash(request('a')));
  assert.equal(ok.call?.expiresAt, String((NOW + 30 * 86_400_000) / 1000));

  const refused = await boardRequestStatus(request('a'), BOARD, { holds: async () => true, simulate: async () => ({ ok: false, reason: 'The board says no.' }), now: NOW });
  assert.ok(refused.available && !refused.posted && !refused.eligible);
  assert.equal(refused.reason, 'The board says no.');
});

test('a request no longer taking proposals is not offered for posting, and its wallet is not even asked', async () => {
  const withdrawn = await boardRequestStatus(request('a', { state: 'cancelled' }), BOARD, { holds: never, simulate: never, now: NOW });
  assert.ok(withdrawn.available && !withdrawn.posted && !withdrawn.eligible);
  assert.equal(withdrawn.holder, null);
});

test('a post can be closed once the request stops taking proposals, not while it still does, and not twice', async () => {
  const board = { requestId: '7', tx: TX('aa'), expiresAt: '2026-12-24T12:00:00.000Z', closedTx: null };
  const open = await boardRequestStatus(request('a', { board }), BOARD, { holds: never, simulate: never, now: NOW });
  assert.ok(open.available && open.posted && !open.canClose);

  const ended = await boardRequestStatus(request('a', { board, state: 'cancelled' }), BOARD, { holds: never, simulate: async () => ({ ok: true }), now: NOW });
  assert.ok(ended.available && ended.posted && ended.canClose);
  assert.equal(ended.requestId, '7');

  const closed = await boardRequestStatus(request('a', { board: { ...board, closedTx: TX('cc') }, state: 'cancelled' }), BOARD, { holds: never, simulate: never, now: NOW });
  assert.ok(closed.available && closed.posted && closed.closed && !closed.canClose);
});
