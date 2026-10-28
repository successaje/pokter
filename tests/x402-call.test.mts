import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { privateKeyToAccount } from 'viem/accounts';

import { runX402Call, settlementTransaction, type SentResponse } from '../src/lib/x402/call';
import { authorizationTypedData, chooseX402Option, paymentHeader, type X402Terms } from '../src/lib/x402/exact';
import { ensureX402, readX402Call } from '../src/lib/x402/receipts';

const BRAIN = 'https://agent.brainonbnb.com/answer?service=health_factor';
const challenge = JSON.parse(readFileSync(new URL('./fixtures/x402/brainonbnb-challenge-2026-10-24.json', import.meta.url), 'utf8'));
const terms = (chooseX402Option(BRAIN, challenge) as { ok: true; terms: X402Terms }).terms;
const buyer = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const NOW_MS = 1_761_300_000_000;
const agent = { chainId: 56, tokenId: '302257' };
let n = 0;

async function signed(overrides: Partial<X402Terms> = {}) {
  n += 1;
  const nonce = (`0x${n.toString(16).padStart(64, '0')}`) as `0x${string}`;
  const t = { ...terms, ...overrides };
  const { typedData, authorization } = authorizationTypedData(t, buyer.address, Math.floor(NOW_MS / 1000), nonce);
  const signature = await buyer.signTypedData(typedData);
  return { header: paymentHeader(t, signature, authorization), nonce };
}
const db = () => {
  const d = new DatabaseSync(':memory:');
  ensureX402(d);
  return d;
};
const fresh = (t: X402Terms = terms) => async () => ({ ok: true as const, terms: t });
const reply = (status: number, text: string, headers: Record<string, string> = {}): SentResponse => ({ status, text, headers: new Headers(headers) });
/* The token's view of an earlier authorization. Most tests start from one that can no longer be taken. */
const onChain = (used: boolean, chainSecondsFromNow: number) => async () => ({ used, chainTime: Math.floor(NOW_MS / 1000) + chainSecondsFromNow });
const expired = onChain(false, 3_600);
const settleHeader = (tx: string) => Buffer.from(JSON.stringify({ success: true, transaction: tx, network: 'eip155:56' })).toString('base64');

test('an answered call stores the answer and the settlement, and a repeat returns it without sending', async () => {
  const d = db();
  const { header, nonce } = await signed();
  let sends = 0;
  const send = async () => {
    sends += 1;
    return reply(200, '{"health_factor":1.48}', { 'payment-response': settleHeader('0x' + '2'.repeat(64)) });
  };
  const first = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(first.kind, 'answered');
  assert.equal(first.kind === 'answered' && first.call.settlementTx, '0x' + '2'.repeat(64));
  const again = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(again.kind, 'answered');
  assert.equal(again.kind === 'answered' && again.replayed, true);
  assert.equal(sends, 1, 'paid once');
  assert.equal(readX402Call(d, nonce)?.responseText, '{"health_factor":1.48}');
});

test('two clicks at once send once; the second is told it is already in flight', async () => {
  const d = db();
  const { header } = await signed();
  let sends = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const send = async () => {
    sends += 1;
    await gate;
    return reply(200, 'ok');
  };
  const a = runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS });
  const b = runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS });
  await new Promise((r) => setTimeout(r, 20));
  release();
  const kinds = [(await a).kind, (await b).kind].sort();
  assert.deepEqual(kinds, ['answered', 'in-flight']);
  assert.equal(sends, 1);
});

test('a lost response is unknown, never success and never retried', async () => {
  const d = db();
  const { header } = await signed();
  const out = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send: async () => { throw new Error('socket hang up'); }, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(out.kind, 'unknown');
  assert.match(out.kind === 'unknown' ? out.call.error ?? '' : '', /Do not pay again/);
  let sends = 0;
  const retry = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send: async () => { sends += 1; return reply(200, 'ok'); }, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(retry.kind, 'unknown', 'said as unknown again, not as a generic "already sent"');
  assert.equal(sends, 0, 'the same authorization is not sent again');
});

test('a changed price or recipient stops the call before anything is sent', async () => {
  const d = db();
  const { header } = await signed();
  let sends = 0;
  const send = async () => { sends += 1; return reply(200, 'ok'); };
  const dearer = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh({ ...terms, amountRaw: '200000000000000000' }), send, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(dearer.kind, 'terms-changed');
  const elsewhere = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh({ ...terms, payTo: '0x000000000000000000000000000000000000dEaD' }), send, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(elsewhere.kind, 'terms-changed');
  assert.equal(sends, 0);
});

test('an authorization for other terms, an expired one, or the wrong header is refused unsent', async () => {
  const d = db();
  const send = async () => reply(200, 'ok');
  const cheaper = await signed({ amountRaw: '1' });
  assert.equal((await runX402Call({ db: d, agreed: terms, agent, header: cheaper.header, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS })).kind, 'invalid');
  const ok = await signed();
  assert.equal((await runX402Call({ db: d, agreed: terms, agent, header: ok.header, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS + 400_000 })).kind, 'invalid');
  assert.equal((await runX402Call({ db: d, agreed: terms, agent, header: { name: 'X-PAYMENT', value: ok.header.value }, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS })).kind, 'invalid');
  assert.equal(readX402Call(d, ok.nonce), null, 'nothing was claimed for a refused authorization');
});

test('a seller that refuses the payment, or cannot be reached for its terms, is said plainly', async () => {
  const d = db();
  const { header } = await signed();
  const refused = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send: async () => reply(402, '{"error":"insufficient balance"}'), readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(refused.kind, 'refused');
  assert.equal(refused.kind === 'refused' && refused.call.responseText, '{"error":"insufficient balance"}');
  const down = await runX402Call({ db: d, agreed: terms, agent, header: (await signed()).header, body: '{}', readFresh: async () => { throw new Error('dns'); }, send: async () => reply(200, 'x'), readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(down.kind, 'unavailable');
});

test('a settlement header is read only when it decodes to a transaction', () => {
  assert.equal(settlementTransaction(new Headers({ 'x-payment-response': settleHeader('0x' + 'a'.repeat(64)) })), '0x' + 'a'.repeat(64));
  assert.equal(settlementTransaction(new Headers({ 'payment-response': 'garbage' })), null);
  assert.equal(settlementTransaction(new Headers()), null);
});

test('a refusal before anything left Pokter is "not sent", and a send stuck by a restart reads as unknown', async () => {
  const { X402NotSentError } = await import('../src/lib/x402/call');
  const { beginX402Call } = await import('../src/lib/x402/receipts');
  const d = db();
  const first = await signed();
  const out = await runX402Call({ db: d, agreed: terms, agent, header: first.header, body: '{}', readFresh: fresh(), send: async () => { throw new X402NotSentError('DNS answer changed'); }, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(out.kind, 'not-sent');

  const stuck = await signed();
  beginX402Call(d, { nonce: stuck.nonce, endpoint: terms.endpoint, payTo: terms.payTo, asset: terms.asset, amountRaw: terms.amountRaw, network: terms.network, payer: buyer.address, agentChainId: 56, agentTokenId: '302257', at: new Date(NOW_MS - 120_000).toISOString() });
  let sends = 0;
  const after = await runX402Call({ db: d, agreed: terms, agent, header: stuck.header, body: '{}', readFresh: fresh(), send: async () => { sends += 1; return reply(200, 'x'); }, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(after.kind, 'unknown', 'a send stuck by a restart reads as unknown, never "sending" forever');
  assert.equal(sends, 0);
});

test('a second signature is offered only when nothing can have been taken, and a seller\'s refusal is not enough', async () => {
  const { maySignAgain } = await import('../src/lib/x402/sign-again');
  const call = (over: object) => ({ ...(readX402Call(db(), '0x00') ?? {}), settlementTx: null, ...over }) as never;
  const now = 1_000;
  const seen = (receipt: object) => ({ kind: 'seen' as const, receipt: { state: 'refused', settlementTx: null, httpStatus: 402, ...receipt } });
  assert.equal(maySignAgain({ kind: 'lost' }, { kind: 'idle' }, now, 1_200), false, 'a lost reply never offers a second payment');
  assert.equal(maySignAgain({ kind: 'unknown', call: call({}) }, { kind: 'idle' }, now, 1_200), false);
  assert.equal(maySignAgain({ kind: 'lost' }, seen({ state: 'unknown', httpStatus: null }), now, 1_200), false);
  assert.equal(maySignAgain({ kind: 'lost' }, seen({ state: 'not-sent', httpStatus: null }), now, 1_200), true);
  assert.equal(maySignAgain({ kind: 'invalid', reason: 'x' }, { kind: 'idle' }, now, 1_200), true);

  // The reviewer's case: refused, no settlement reported. Not on the seller's word.
  assert.equal(maySignAgain({ kind: 'refused', call: call({}) }, { kind: 'idle' }, now, 1_200), false, 'a refusal with no transaction does not offer a new signature');
  assert.equal(maySignAgain({ kind: 'refused', call: call({}) }, seen({ settlement: 'may-still-settle' }), now, 1_200), false, 'not while the token can still take it');
  assert.equal(maySignAgain({ kind: 'refused', call: call({}) }, seen({ settlement: 'unread' }), now, 1_200), false, 'not when the chain could not be read');
  assert.equal(maySignAgain({ kind: 'refused', call: call({}) }, seen({ settlement: 'settled' }), now, 1_200), false, 'not when it was taken');
  assert.equal(maySignAgain({ kind: 'refused', call: call({}) }, seen({ settlement: 'expired-unused' }), now, 1_200), true, 'only once the token says it never can be taken');

  // Pokter has no record: only once the signature has expired.
  assert.equal(maySignAgain({ kind: 'lost' }, { kind: 'missing' }, now, 1_200), false, 'a request still on its way could yet be sent');
  assert.equal(maySignAgain({ kind: 'lost' }, { kind: 'missing' }, 1_200, 1_200), true);
});

test('only a 2xx is an answer, and only a 402 with no settlement is a refusal', async () => {
  const { classifyReply } = await import('../src/lib/x402/call');
  const tx = '0x' + '3'.repeat(64);
  assert.equal(classifyReply(200, null), 'answered');
  assert.equal(classifyReply(402, null), 'refused');
  assert.equal(classifyReply(402, tx), 'unknown', 'a refusal that names a settlement may have been taken');
  for (const status of [400, 404, 409, 500, 502, 503]) assert.equal(classifyReply(status, null), 'unknown', String(status));
});

test('a seller error after the request is unknown and says to check the chain, never "refused"', async () => {
  const d = db();
  const { header } = await signed();
  const out = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send: async () => reply(500, 'internal error'), readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(out.kind, 'unknown');
  assert.match(out.kind === 'unknown' ? out.call.error ?? '' : '', /Do not pay again/);
});

test('a new payment is not sent while an earlier one to the same seller may still be taken', async () => {
  const d = db();
  const first = await signed();
  await runX402Call({ db: d, agreed: terms, agent, header: first.header, body: '{}', readFresh: fresh(), send: async () => reply(402, '{"error":"no"}'), readAuthorization: expired, nowMs: NOW_MS });
  let sends = 0;
  const send = async () => { sends += 1; return reply(200, '{"ok":1}'); };

  const pending = await signed();
  const blocked = await runX402Call({ db: d, agreed: terms, agent, header: pending.header, body: '{}', readFresh: fresh(), send, readAuthorization: onChain(false, 0), nowMs: NOW_MS });
  assert.equal(blocked.kind, 'unresolved');
  assert.equal(blocked.kind === 'unresolved' && blocked.earlier.settlement, 'may-still-settle');
  assert.equal(sends, 0, 'nothing sent while the earlier one can still be taken');
  assert.equal(readX402Call(d, pending.nonce), null, 'and the new one was not claimed, so it can be sent later');

  const unreadable = await runX402Call({ db: d, agreed: terms, agent, header: pending.header, body: '{}', readFresh: fresh(), send, readAuthorization: async () => { throw new Error('rpc down'); }, nowMs: NOW_MS });
  assert.equal(unreadable.kind, 'unresolved', 'a chain that cannot be read is never "not taken"');
  assert.equal(sends, 0);

  const after = await runX402Call({ db: d, agreed: terms, agent, header: pending.header, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(after.kind, 'answered', 'once the token says the earlier one expired unused, the new one goes');
  assert.equal(sends, 1);
  assert.equal(readX402Call(d, first.nonce)?.settlement, 'expired-unused');
});

test('an earlier payment the token says was taken is reported once, then a new one may go', async () => {
  const d = db();
  const first = await signed();
  await runX402Call({ db: d, agreed: terms, agent, header: first.header, body: '{}', readFresh: fresh(), send: async () => reply(500, 'oops'), readAuthorization: expired, nowMs: NOW_MS });
  let sends = 0;
  const send = async () => { sends += 1; return reply(200, '{"ok":1}'); };
  const second = await signed();
  const told = await runX402Call({ db: d, agreed: terms, agent, header: second.header, body: '{}', readFresh: fresh(), send, readAuthorization: onChain(true, 0), nowMs: NOW_MS });
  assert.equal(told.kind, 'unresolved');
  assert.equal(told.kind === 'unresolved' && told.earlier.settlement, 'settled');
  assert.match(told.kind === 'unresolved' ? told.reason : '', /was taken on chain/);
  assert.equal(sends, 0);
  const third = await signed();
  assert.equal((await runX402Call({ db: d, agreed: terms, agent, header: third.header, body: '{}', readFresh: fresh(), send, readAuthorization: onChain(true, 0), nowMs: NOW_MS })).kind, 'answered');
  assert.equal(sends, 1);
});

test('the settlement is also read from a JSON body, as some sellers report it', () => {
  const tx = '0x7f7e43456ed50b72e6f1d18b528d8dbd0b033a69fbd5186b2eda54937982daa0';
  assert.equal(settlementTransaction(new Headers(), JSON.stringify({ ok: true, tx })), tx);
  assert.equal(settlementTransaction(new Headers(), '{"tx":"0x12"}'), null);
  assert.equal(settlementTransaction(new Headers(), 'not json'), null);
});

test('on chain: used is settled, unused past validBefore can never be taken, anything else may still be', async () => {
  const { settlementOf } = await import('../src/lib/x402/reconcile');
  const row = { validBefore: 1_000, createdAt: new Date(0).toISOString() };
  assert.equal(settlementOf(row, { used: true, chainTime: 0 }), 'settled');
  assert.equal(settlementOf(row, { used: false, chainTime: 999 }), 'may-still-settle');
  assert.equal(settlementOf(row, { used: false, chainTime: 1_000 }), 'expired-unused');
  assert.equal(settlementOf({ validBefore: null, createdAt: new Date(0).toISOString() }, { used: false, chainTime: 300 }), 'may-still-settle', 'an older row is bounded by the longest validity Pokter accepted');
  assert.equal(settlementOf({ validBefore: null, createdAt: new Date(0).toISOString() }, { used: false, chainTime: 305 }), 'expired-unused');
});

test('a retry of the same authorization says what happened to it, and only a never-sent one is sent', async () => {
  const { X402NotSentError } = await import('../src/lib/x402/call');
  const d = db();
  // Refused by the seller: the stored refusal comes back, nothing is resent.
  const refusedOnce = await signed();
  let sends = 0;
  await runX402Call({ db: d, agreed: terms, agent, header: refusedOnce.header, body: '{}', readFresh: fresh(), send: async () => { sends += 1; return reply(402, '{"error":"no"}'); }, readAuthorization: expired, nowMs: NOW_MS });
  const again = await runX402Call({ db: d, agreed: terms, agent, header: refusedOnce.header, body: '{}', readFresh: fresh(), send: async () => { sends += 1; return reply(200, 'x'); }, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(again.kind, 'refused');
  assert.equal(sends, 1);

  // Never sent: the same authorization may be sent once more, and is.
  const neverSent = await signed();
  await runX402Call({ db: d, agreed: terms, agent, header: neverSent.header, body: '{}', readFresh: fresh(), send: async () => { throw new X402NotSentError('DNS changed'); }, readAuthorization: expired, nowMs: NOW_MS });
  let retrySends = 0;
  const retried = await runX402Call({ db: d, agreed: terms, agent, header: neverSent.header, body: '{}', readFresh: fresh(), send: async () => { retrySends += 1; return reply(200, '{"ok":1}'); }, readAuthorization: expired, nowMs: NOW_MS });
  assert.equal(retried.kind, 'answered');
  assert.equal(retrySends, 1);

  // Two retries of a never-sent authorization at once: one sends, the other is told it is in flight.
  const raced = await signed();
  await runX402Call({ db: d, agreed: terms, agent, header: raced.header, body: '{}', readFresh: fresh(), send: async () => { throw new X402NotSentError('DNS changed'); }, readAuthorization: expired, nowMs: NOW_MS });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let racedSends = 0;
  const send = async () => { racedSends += 1; await gate; return reply(200, 'ok'); };
  const a = runX402Call({ db: d, agreed: terms, agent, header: raced.header, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS });
  const b = runX402Call({ db: d, agreed: terms, agent, header: raced.header, body: '{}', readFresh: fresh(), send, readAuthorization: expired, nowMs: NOW_MS });
  await new Promise((r) => setTimeout(r, 20));
  release();
  assert.deepEqual([(await a).kind, (await b).kind].sort(), ['answered', 'in-flight']);
  assert.equal(racedSends, 1);
});

test('the live store, written before expiry and settlement were kept, gains both and keeps its rows', () => {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE x402_calls (nonce TEXT PRIMARY KEY, state TEXT NOT NULL, endpoint TEXT NOT NULL, pay_to TEXT NOT NULL, asset TEXT NOT NULL, amount_raw TEXT NOT NULL, network TEXT NOT NULL, payer TEXT NOT NULL, agent_chain_id INTEGER NOT NULL, agent_token_id TEXT NOT NULL, http_status INTEGER, settlement_tx TEXT, response_text TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  d.prepare(`INSERT INTO x402_calls VALUES ('0xaa', 'answered', 'e', '0x690E950214980BC329823A2DB2fD90C06Bd54dE4', 'a', '1', 'eip155:56', '0xdAb12cf15F4385188bE62bda9F00877AF4C1b32f', 56, '302257', 200, NULL, '{}', NULL, '2026-10-25T18:51:13.263Z', '2026-10-25T18:51:16.594Z')`).run();
  ensureX402(d);
  ensureX402(d);
  const row = readX402Call(d, '0xaa');
  assert.equal(row?.state, 'answered');
  assert.equal(row?.validBefore, null);
  assert.equal(row?.settlement, null);
});
