import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, getAddress, keccak256, stringToBytes, type Address, type Hex, type Log } from 'viem';

import type { Brief } from '../../src/lib/briefs/model';

/*
 * A new request posted on PokterBoard from a wallet that signs no plain
 * message, as an Agentic Wallet does not. Pokter returns the board call
 * with the exact text it commits to, and publishes the request only for a
 * transaction from that wallet that posted exactly that text's hash and
 * that the board logged. The post is then the request's proof, in place
 * of a signature.
 */

const dir = mkdtempSync(join(tmpdir(), 'pokter-board-new-request-'));
process.env.BRIEF_DB_PATH = join(dir, 'briefs.db');
const { getBriefStore } = await import('../../src/lib/briefs/store');
const { prepareBoardRequest, recordBoardRequest, RECORD_WINDOW_MS } = await import('../../src/lib/board/new-request');
const { BOARD_ABI } = await import('../../src/lib/board/contract');
const { briefMessage } = await import('../../src/lib/briefs/model');
const { requestSummary } = await import('../../src/lib/briefs/public-view');

const BOARD: Address = getAddress('0x00000000000000000000000000000000000b0a2d');
const POSTER: Address = getAddress('0x564cbb1c360af36681591f47af469913b6364431');
const STRANGER: Address = getAddress('0x7751be7b2ba4141d5e32ef14e9e5cc73e9d7bf0c');
const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const TX = (b: string) => `0x${b.repeat(32)}` as Hex;

const content = {
  title: 'Check a token before I buy it',
  brief: 'Tell me whether CAKE is safe to buy, with the sources you read.',
  acceptance: ['Names every owner power it found'],
  failSignals: ['A verdict without sources'],
  budgetU: 0.05,
  chainId: 56,
  deliverDays: 2,
  category: 'token-safety',
};

const holder = { holds: async () => true, simulate: async () => ({ ok: true as const }), targetProblem: async () => null, now: NOW };
const never = async (): Promise<never> => {
  throw new Error('not asked');
};

function posted(args: { requestId: bigint; poster: Address; briefHash: Hex; expiresAt: bigint }, address: Address = BOARD): Log {
  const topics = encodeEventTopics({ abi: BOARD_ABI, eventName: 'RequestPosted', args } as never) as [Hex, ...Hex[]];
  const data = encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint64' }], [args.briefHash, args.expiresAt]);
  return { address, topics, data, blockHash: null, blockNumber: null, logIndex: null, transactionHash: null, transactionIndex: null, removed: false } as Log;
}

async function prepared() {
  const result = await prepareBoardRequest({ poster: POSTER.toLowerCase(), content }, BOARD, holder);
  assert.ok(result.ok, 'prepared');
  return result;
}

/** The transaction the wallet sends for a prepared request, as the chain would return it. */
async function sentFor(p: Awaited<ReturnType<typeof prepared>>, over: { from?: Address; to?: Address; succeeded?: boolean; logs?: Log[] } = {}) {
  const expiresAt = BigInt(Date.parse(p.expiresAt) / 1000);
  return {
    from: over.from ?? POSTER,
    to: over.to ?? BOARD,
    input: p.call.data,
    succeeded: over.succeeded ?? true,
    logs: over.logs ?? [posted({ requestId: 12n, poster: over.from ?? POSTER, briefHash: p.briefHash, expiresAt })],
  };
}

test('a holder’s request comes back as the board call, with the exact text it commits to and the body to record it with', async () => {
  const p = await prepared();
  assert.equal(p.record.poster, POSTER);
  assert.equal(p.record.postedAt, new Date(NOW).toISOString());
  assert.equal(p.text, briefMessage({ ...p.record.content, poster: POSTER, postedAt: p.record.postedAt }));
  assert.equal(p.briefHash, keccak256(stringToBytes(p.text)));
  assert.equal(p.expiresAt, new Date(NOW + 30 * 86_400_000).toISOString(), 'no closing date: the post stands 30 days');
  assert.deepEqual(p.call, { binanceChainId: '56', to: BOARD, data: p.call.data, value: '0' });
  const call = decodeFunctionData({ abi: BOARD_ABI, data: p.call.data });
  assert.equal(call.functionName, 'postRequest');
  assert.deepEqual(call.args, [p.briefHash, BigInt((NOW + 30 * 86_400_000) / 1000)]);
  assert.match(p.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal('budgetRaw' in p.record.content, false, 'the amount is worked out again on record, never taken from the caller');
});

test('nothing is prepared without a wallet, valid terms, a board, an Agent ID, or the board’s own yes', async () => {
  const refused = async (input: { poster: unknown; content: unknown }, board: Address | null, deps: Parameters<typeof prepareBoardRequest>[2]) => {
    const result = await prepareBoardRequest(input, board, deps);
    assert.equal(result.ok, false);
    return result as { ok: false; status: number; error: string };
  };
  assert.equal((await refused({ poster: 'me', content }, BOARD, { ...holder, holds: never })).status, 400);
  assert.equal((await refused({ poster: POSTER, content: { ...content, acceptance: [] } }, BOARD, { ...holder, holds: never })).status, 400);
  assert.match((await refused({ poster: POSTER, content }, null, { ...holder, holds: never })).error, /not open yet/);
  assert.match((await refused({ poster: POSTER, content }, BOARD, { ...holder, holds: async () => false, simulate: never })).error, /holds no Agent ID/);
  assert.equal((await refused({ poster: POSTER, content }, BOARD, { ...holder, targetProblem: async () => 'This builder is no longer accepting public requests.', holds: never })).status, 409);
  assert.equal((await refused({ poster: POSTER, content }, BOARD, { ...holder, simulate: async () => ({ ok: false, reason: 'The board says no.' }) })).error, 'The board says no.');
});

test('the request is published only for the poster’s post of exactly its text, with the post as its proof', async () => {
  const store = getBriefStore();
  const p = await prepared();
  const sent = await sentFor(p);
  const record = (over: Record<string, unknown> = {}, deps: Partial<Parameters<typeof recordBoardRequest>[2]> = {}) =>
    recordBoardRequest({ ...p.record, transactionHash: TX('aa'), ...over }, BOARD, { store, read: async () => sent, find: never, targetProblem: async () => null, now: NOW + 60_000, ...deps });

  const stranger = await record({}, { read: async () => sentFor(p, { from: STRANGER }) });
  assert.ok(!stranger.ok && stranger.status === 403, 'sent by another wallet');
  const failed = await record({}, { read: async () => sentFor(p, { succeeded: false }) });
  assert.ok(!failed.ok && /failed on chain/.test(failed.error));
  const elsewhere = await record({}, { read: async () => sentFor(p, { to: STRANGER }) });
  assert.ok(!elsewhere.ok && /not sent to PokterBoard/.test(elsewhere.error));
  const edited = await record({ content: { ...p.record.content, budgetU: 0.06 } });
  assert.ok(!edited.ok && /different request/.test(edited.error), 'terms changed after the post');
  const unlogged = await record({}, { read: async () => sentFor(p, { logs: [] }) });
  assert.ok(!unlogged.ok && /did not record/.test(unlogged.error));
  assert.equal(store.get(p.id), null, 'nothing is published by a refused record');

  const first = await record();
  assert.ok(first.ok && first.created);
  const brief = store.get(p.id);
  assert.ok(brief);
  assert.equal(brief.proof, 'board');
  assert.equal(brief.signature, '0x');
  assert.equal(brief.poster.toLowerCase(), POSTER.toLowerCase());
  assert.equal(brief.state, 'open');
  assert.deepEqual(brief.board, { requestId: '12', tx: TX('aa'), expiresAt: p.expiresAt, closedTx: null });
  assert.equal(brief.budgetRaw, '50000000000000000');

  const again = await record({}, { read: never });
  assert.ok(again.ok && !again.created && again.brief.id === p.id, 'recorded twice, the same request');

  const summary = requestSummary(brief, { proposals: 0, hired: false }, 'https://pokter.xyz', NOW);
  assert.equal(summary.proof, 'board');
  assert.equal(summary.board?.transactionHash, TX('aa'));
});

test('with no transaction given, the poster’s recent post of the hash is looked up; none yet is said so', async () => {
  const store = getBriefStore();
  const p = await prepareBoardRequest({ poster: POSTER, content: { ...content, title: 'Watch a vault for me' } }, BOARD, holder);
  assert.ok(p.ok);
  const asked: unknown[] = [];
  const none = await recordBoardRequest({ ...p.record }, BOARD, {
    store,
    find: async (_board, find) => {
      asked.push(find);
      return null;
    },
    read: never,
    now: NOW,
  });
  assert.ok(!none.ok && none.status === 404 && /Binance App/.test(none.error));
  assert.deepEqual(asked, [{ post: { poster: POSTER, briefHash: p.briefHash } }]);

  const found = await recordBoardRequest({ ...p.record }, BOARD, { store, find: async () => TX('bb'), read: async () => sentFor(p), targetProblem: async () => null, now: NOW });
  assert.ok(found.ok && found.created && found.brief.board?.tx === TX('bb'));
});

test('a request prepared more than a day ago, or dated ahead, is not recorded', async () => {
  const p = await prepared();
  const store = getBriefStore();
  const late = await recordBoardRequest({ ...p.record }, BOARD, { store, find: never, read: never, now: NOW + RECORD_WINDOW_MS + 1 });
  assert.ok(!late.ok && /more than a day ago/.test(late.error));
  const ahead = await recordBoardRequest({ ...p.record, postedAt: new Date(NOW + 3_600_000).toISOString() }, BOARD, { store, find: never, read: never, now: NOW });
  assert.ok(!ahead.ok && ahead.status === 409);
  const bad = await recordBoardRequest({ ...p.record, transactionHash: '0x12' }, BOARD, { store, find: never, read: never, now: NOW });
  assert.ok(!bad.ok && bad.status === 400);
});

test('a request already signed on Pokter, posted with the same text, keeps its signature and gains the post', async () => {
  const store = getBriefStore();
  const p = await prepareBoardRequest({ poster: POSTER, content: { ...content, title: 'Signed first, posted after' } }, BOARD, holder);
  assert.ok(p.ok);
  const signed: Brief = { ...p.record.content, budgetRaw: '50000000000000000', id: p.id, poster: POSTER, signature: '0x01', state: 'open', postedAt: p.record.postedAt, awardedBidId: null };
  store.add(signed);
  const result = await recordBoardRequest({ ...p.record, transactionHash: TX('cc') }, BOARD, { store, find: never, read: async () => sentFor(p), targetProblem: never, now: NOW });
  assert.ok(result.ok && !result.created);
  assert.equal(store.get(p.id)?.proof, 'signature');
  assert.equal(store.get(p.id)?.signature, '0x01');
  assert.equal(store.get(p.id)?.board?.tx, TX('cc'));
});

test('a request with the board as its proof cannot be stored without the post', () => {
  const store = getBriefStore();
  assert.throws(() =>
    store.add({ ...content, paymentToken: null, budgetRaw: '1', closesAt: null, targetBuilder: null, id: 'x', poster: POSTER, signature: '0x', proof: 'board', state: 'open', postedAt: new Date(NOW).toISOString(), awardedBidId: null, board: null }),
  );
});

test('a custom request to a builder no longer taking them is refused at record, saying the post stands and nothing was paid', async () => {
  const store = getBriefStore();
  const p = await prepareBoardRequest({ poster: POSTER, content: { ...content, title: 'For one builder' } }, BOARD, holder);
  assert.ok(p.ok);
  const result = await recordBoardRequest({ ...p.record, transactionHash: TX('dd') }, BOARD, {
    store,
    find: never,
    read: async () => sentFor(p),
    targetProblem: async () => 'This builder is no longer accepting public requests.',
    now: NOW,
  });
  assert.ok(!result.ok && result.status === 409 && /nothing was paid/.test(result.error));
  assert.equal(store.get(p.id), null);
});

test('a signed request reads as signed, and a request from before proofs did too', () => {
  const store = getBriefStore();
  store.add({ ...content, paymentToken: null, budgetRaw: '1', closesAt: null, targetBuilder: null, id: 'signed-1', poster: POSTER, signature: '0x01', state: 'open', postedAt: new Date(NOW).toISOString(), awardedBidId: null });
  assert.equal(store.get('signed-1')?.proof, 'signature');
  assert.equal(requestSummary(store.get('signed-1')!, { proposals: 0, hired: false }, 'https://pokter.xyz', NOW).proof, 'signature');
});

