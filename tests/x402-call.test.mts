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
const settleHeader = (tx: string) => Buffer.from(JSON.stringify({ success: true, transaction: tx, network: 'eip155:56' })).toString('base64');

test('an answered call stores the answer and the settlement, and a repeat returns it without sending', async () => {
  const d = db();
  const { header, nonce } = await signed();
  let sends = 0;
  const send = async () => {
    sends += 1;
    return reply(200, '{"health_factor":1.48}', { 'payment-response': settleHeader('0x' + '2'.repeat(64)) });
  };
  const first = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send, nowMs: NOW_MS });
  assert.equal(first.kind, 'answered');
  assert.equal(first.kind === 'answered' && first.call.settlementTx, '0x' + '2'.repeat(64));
  const again = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send, nowMs: NOW_MS });
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
  const a = runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send, nowMs: NOW_MS });
  const b = runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send, nowMs: NOW_MS });
  await new Promise((r) => setTimeout(r, 20));
  release();
  const kinds = [(await a).kind, (await b).kind].sort();
  assert.deepEqual(kinds, ['already-sent', 'answered']);
  assert.equal(sends, 1);
});

test('a lost response is unknown, never success and never retried', async () => {
  const d = db();
  const { header } = await signed();
  const out = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send: async () => { throw new Error('socket hang up'); }, nowMs: NOW_MS });
  assert.equal(out.kind, 'unknown');
  assert.match(out.kind === 'unknown' ? out.call.error ?? '' : '', /Do not pay again/);
  let sends = 0;
  const retry = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send: async () => { sends += 1; return reply(200, 'ok'); }, nowMs: NOW_MS });
  assert.equal(retry.kind, 'already-sent');
  assert.equal(sends, 0, 'the same authorization is not sent again');
});

test('a changed price or recipient stops the call before anything is sent', async () => {
  const d = db();
  const { header } = await signed();
  let sends = 0;
  const send = async () => { sends += 1; return reply(200, 'ok'); };
  const dearer = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh({ ...terms, amountRaw: '200000000000000000' }), send, nowMs: NOW_MS });
  assert.equal(dearer.kind, 'terms-changed');
  const elsewhere = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh({ ...terms, payTo: '0x000000000000000000000000000000000000dEaD' }), send, nowMs: NOW_MS });
  assert.equal(elsewhere.kind, 'terms-changed');
  assert.equal(sends, 0);
});

test('an authorization for other terms, an expired one, or the wrong header is refused unsent', async () => {
  const d = db();
  const send = async () => reply(200, 'ok');
  const cheaper = await signed({ amountRaw: '1' });
  assert.equal((await runX402Call({ db: d, agreed: terms, agent, header: cheaper.header, body: '{}', readFresh: fresh(), send, nowMs: NOW_MS })).kind, 'invalid');
  const ok = await signed();
  assert.equal((await runX402Call({ db: d, agreed: terms, agent, header: ok.header, body: '{}', readFresh: fresh(), send, nowMs: NOW_MS + 400_000 })).kind, 'invalid');
  assert.equal((await runX402Call({ db: d, agreed: terms, agent, header: { name: 'X-PAYMENT', value: ok.header.value }, body: '{}', readFresh: fresh(), send, nowMs: NOW_MS })).kind, 'invalid');
  assert.equal(readX402Call(d, ok.nonce), null, 'nothing was claimed for a refused authorization');
});

test('a seller that refuses the payment, or cannot be reached for its terms, is said plainly', async () => {
  const d = db();
  const { header } = await signed();
  const refused = await runX402Call({ db: d, agreed: terms, agent, header, body: '{}', readFresh: fresh(), send: async () => reply(402, '{"error":"insufficient balance"}'), nowMs: NOW_MS });
  assert.equal(refused.kind, 'refused');
  assert.equal(refused.kind === 'refused' && refused.call.responseText, '{"error":"insufficient balance"}');
  const down = await runX402Call({ db: d, agreed: terms, agent, header: (await signed()).header, body: '{}', readFresh: async () => { throw new Error('dns'); }, send: async () => reply(200, 'x'), nowMs: NOW_MS });
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
  const out = await runX402Call({ db: d, agreed: terms, agent, header: first.header, body: '{}', readFresh: fresh(), send: async () => { throw new X402NotSentError('DNS answer changed'); }, nowMs: NOW_MS });
  assert.equal(out.kind, 'not-sent');

  const stuck = await signed();
  beginX402Call(d, { nonce: stuck.nonce, endpoint: terms.endpoint, payTo: terms.payTo, asset: terms.asset, amountRaw: terms.amountRaw, network: terms.network, payer: buyer.address, agentChainId: 56, agentTokenId: '302257', at: new Date(NOW_MS - 120_000).toISOString() });
  let sends = 0;
  const after = await runX402Call({ db: d, agreed: terms, agent, header: stuck.header, body: '{}', readFresh: fresh(), send: async () => { sends += 1; return reply(200, 'x'); }, nowMs: NOW_MS });
  assert.equal(after.kind, 'already-sent');
  assert.equal(after.kind === 'already-sent' && after.call.state, 'unknown', 'never "sending" forever');
  assert.equal(sends, 0);
});

test('a second signature is offered only when nothing can have been taken', async () => {
  const { maySignAgain } = await import('../src/lib/x402/sign-again');
  const call = (over: object) => ({ ...(readX402Call(db(), '0x00') ?? {}), settlementTx: null, ...over }) as never;
  assert.equal(maySignAgain({ kind: 'lost' }, { kind: 'idle' }), false, 'a lost reply never offers a second payment');
  assert.equal(maySignAgain({ kind: 'unknown', call: call({}) }, { kind: 'idle' }), false);
  assert.equal(maySignAgain({ kind: 'lost' }, { kind: 'seen', receipt: { state: 'unknown', settlementTx: null, httpStatus: null } }), false);
  assert.equal(maySignAgain({ kind: 'lost' }, { kind: 'missing' }), true, 'Pokter never received it');
  assert.equal(maySignAgain({ kind: 'lost' }, { kind: 'seen', receipt: { state: 'not-sent', settlementTx: null, httpStatus: null } }), true);
  assert.equal(maySignAgain({ kind: 'refused', call: call({}) }, { kind: 'idle' }), true);
  assert.equal(maySignAgain({ kind: 'refused', call: call({ settlementTx: '0x' + '1'.repeat(64) }) }, { kind: 'idle' }), false, 'refused but settled: may have been taken');
  assert.equal(maySignAgain({ kind: 'invalid', reason: 'x' }, { kind: 'idle' }), true);
});
