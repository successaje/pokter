import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, getAddress, keccak256, stringToBytes, type Address, type Hex, type Log } from 'viem';

import { BOARD_ABI } from '../src/lib/board/contract';
import { BOARD_REQUEST_DAYS, boardCloseRequestCall, boardPostRequestCall, boardRequestExpiry, readBoardRequestTx, requestBriefHash } from '../src/lib/board/requests';
import { briefMessage, type Brief } from '../src/lib/briefs/model';

/*
 * A Pokter request posted on PokterBoard: the board keeps the hash of the
 * text its poster signed and when the post stops standing, and Pokter shows
 * a request as on the board only for a transaction from its poster that
 * posted exactly that hash, or closed that post, and that the board logged.
 */

const BOARD: Address = '0x00000000000000000000000000000000000B0A2D';
const POSTER: Address = getAddress('0x564cbb1c360af36681591f47af469913b6364431');
const STRANGER: Address = getAddress('0x7751be7b2ba4141d5e32ef14e9e5cc73e9d7bf0c');
const NOW = Date.parse('2026-11-24T12:00:00.000Z');

const request: Brief = {
  id: '8f3c2a10-1d2e-4c5b-9a7f-0e1d2c3b4a59',
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
  board: null,
};

function log(eventName: 'RequestPosted' | 'RequestClosed', args: Record<string, unknown>, address: Address = BOARD): Log {
  const topics = encodeEventTopics({ abi: BOARD_ABI, eventName, args } as never) as [Hex, ...Hex[]];
  const data =
    eventName === 'RequestPosted'
      ? encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint64' }], [args.briefHash as Hex, args.expiresAt as bigint])
      : '0x';
  return { address, topics, data, blockHash: null, blockNumber: null, logIndex: null, transactionHash: null, transactionIndex: null, removed: false } as Log;
}

test('a request’s board hash is the hash of the exact text its poster signed, and any signed change moves it', () => {
  assert.equal(requestBriefHash(request), keccak256(stringToBytes(briefMessage(request))));
  assert.notEqual(requestBriefHash({ ...request, title: 'Check a token before I sell it' }), requestBriefHash(request));
  assert.notEqual(requestBriefHash({ ...request, budgetU: 0.06 }), requestBriefHash(request));
});

test('the post stands until the request closes, or for 30 days when it has no closing date', () => {
  const closes = '2026-12-01T00:00:00.000Z';
  assert.equal(boardRequestExpiry({ closesAt: closes }, NOW), BigInt(Date.parse(closes) / 1000));
  assert.equal(BOARD_REQUEST_DAYS, 30);
  assert.equal(boardRequestExpiry({ closesAt: null }, NOW), BigInt((NOW + 30 * 86_400_000) / 1000));
  // A closing date already passed is never sent: the board refuses an expiry in the past.
  assert.equal(boardRequestExpiry({ closesAt: '2026-11-01T00:00:00.000Z' }, NOW), BigInt((NOW + 30 * 86_400_000) / 1000));
});

test('the calls post this request’s hash, or close its post, on the board', () => {
  const post = boardPostRequestCall(request, BOARD, NOW);
  assert.equal(post.address, BOARD);
  assert.equal(post.functionName, 'postRequest');
  assert.deepEqual(post.args, [requestBriefHash(request), boardRequestExpiry(request, NOW)]);
  assert.deepEqual(boardCloseRequestCall('7', BOARD).args, [7n]);
});

const postInput = encodeFunctionData({ abi: BOARD_ABI, functionName: 'postRequest', args: [requestBriefHash(request), 1_796_000_000n] });
const posted = log('RequestPosted', { requestId: 7n, poster: POSTER, briefHash: requestBriefHash(request), expiresAt: 1_796_000_000n });

test('the poster’s post of this request, logged by the board, puts it on the board with the board’s number', () => {
  const reading = readBoardRequestTx({ request, board: BOARD, tx: { from: POSTER, to: BOARD, input: postInput }, succeeded: true, logs: [posted] });
  assert.deepEqual(reading, { ok: true, action: 'post', requestId: '7', expiresAt: new Date(1_796_000_000 * 1000).toISOString() });
});

test('a failed post, one to elsewhere, from someone else, of other text, or unlogged by the board shows nothing', () => {
  const tx = { from: POSTER, to: BOARD, input: postInput };
  const refused = (input: Partial<Parameters<typeof readBoardRequestTx>[0]>) => readBoardRequestTx({ request, board: BOARD, tx, succeeded: true, logs: [posted], ...input });
  assert.equal(refused({ succeeded: false }).ok, false);
  assert.equal(refused({ tx: { ...tx, to: STRANGER } }).ok, false);
  assert.equal(refused({ tx: { ...tx, from: STRANGER } }).ok, false);
  const other = encodeFunctionData({ abi: BOARD_ABI, functionName: 'postRequest', args: [keccak256(stringToBytes('another request')), 1_796_000_000n] });
  assert.equal(refused({ tx: { ...tx, input: other } }).ok, false);
  assert.equal(refused({ logs: [] }).ok, false);
  assert.equal(refused({ logs: [log('RequestPosted', { requestId: 7n, poster: POSTER, briefHash: requestBriefHash(request), expiresAt: 1_796_000_000n }, STRANGER)] }).ok, false);
  const review = encodeFunctionData({ abi: BOARD_ABI, functionName: 'review', args: [57238n, 5, 11, `0x${'00'.repeat(32)}`] });
  assert.equal(refused({ tx: { ...tx, input: review } }).ok, false);
});

test('the poster closing its post, logged by the board, closes it; another post’s close, or a close of nothing, does not', () => {
  const onBoard = { ...request, board: { requestId: '7', tx: `0x${'aa'.repeat(32)}` as Hex, expiresAt: '2026-12-24T12:00:00.000Z', closedTx: null } };
  const close = (id: bigint) => encodeFunctionData({ abi: BOARD_ABI, functionName: 'closeRequest', args: [id] });
  const closed = log('RequestClosed', { requestId: 7n });
  assert.deepEqual(readBoardRequestTx({ request: onBoard, board: BOARD, tx: { from: POSTER, to: BOARD, input: close(7n) }, succeeded: true, logs: [closed] }), { ok: true, action: 'close', requestId: '7' });
  assert.equal(readBoardRequestTx({ request: onBoard, board: BOARD, tx: { from: POSTER, to: BOARD, input: close(8n) }, succeeded: true, logs: [log('RequestClosed', { requestId: 8n })] }).ok, false);
  assert.equal(readBoardRequestTx({ request, board: BOARD, tx: { from: POSTER, to: BOARD, input: close(7n) }, succeeded: true, logs: [closed] }).ok, false);
  assert.equal(readBoardRequestTx({ request: onBoard, board: BOARD, tx: { from: POSTER, to: BOARD, input: close(7n) }, succeeded: true, logs: [] }).ok, false);
});
