/**
 * The x402 routes, run as the routes they are: off by default, and the
 * receipt lookup refusing what it should. The paid path itself is covered
 * against an injected network in tests/x402-call.test.mts.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'pokter-x402-route-'));
process.env.X402_DB_PATH = join(dir, 'x402.db');
process.env.RATE_LIMIT_DB_PATH = join(dir, 'rate-limit.db');

const pick = <T,>(m: unknown, name: string): T => ((m as Record<string, unknown>)[name] ?? (m as { default: Record<string, unknown> }).default[name]) as T;
const terms = pick<(r: Request) => Promise<Response>>(await import('../../src/app/api/x402/terms/route'), 'GET');
const call = pick<(r: Request) => Promise<Response>>(await import('../../src/app/api/x402/call/route'), 'POST');
const receipt = pick<(r: Request, c: { params: Promise<{ nonce: string }> }) => Promise<Response>>(await import('../../src/app/api/x402/calls/[nonce]/route'), 'GET');
const receiptPost = pick<(r: Request, c: { params: Promise<{ nonce: string }> }) => Promise<Response>>(await import('../../src/app/api/x402/calls/[nonce]/route'), 'POST');
const store = await import('../../src/lib/x402/receipts');
const db = await import('../../src/lib/x402/receipts-db');

const nonce = '0x' + 'cd'.repeat(32);
const get = (url: string) => new Request(url, { headers: { 'x-forwarded-for': '198.51.100.7' } });

test('off unless the operator says exactly "true"', async () => {
  for (const value of [undefined, '', 'false', '1', 'TRUE ', 'yes']) {
    if (value === undefined) delete process.env.NEXT_PUBLIC_X402_ENABLED;
    else process.env.NEXT_PUBLIC_X402_ENABLED = value;
    assert.equal((await terms(get('http://localhost/api/x402/terms?chainId=56&tokenId=1'))).status, 404, String(value));
    assert.equal((await call(new Request('http://localhost/api/x402/call', { method: 'POST', body: '{}' }))).status, 404);
    assert.equal((await receipt(get('http://localhost/x'), { params: Promise.resolve({ nonce }) })).status, 404);
  }
});

test('when on, a malformed call is refused before anything is read or sent', async () => {
  process.env.NEXT_PUBLIC_X402_ENABLED = 'true';
  const response = await call(new Request('http://localhost/api/x402/call', { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.8' }, body: JSON.stringify({ chainId: 56, tokenId: '1' }) }));
  assert.equal(response.status, 400);
});

test('when on, an agent on testnet has no x402 terms, said as unsupported rather than as an error', async () => {
  process.env.NEXT_PUBLIC_X402_ENABLED = 'true';
  const response = await terms(get('http://localhost/api/x402/terms?chainId=97&tokenId=2618'));
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { supported: boolean }).supported, false);
});

test('a receipt is found by its nonce, and nothing else is', async () => {
  process.env.NEXT_PUBLIC_X402_ENABLED = 'true';
  assert.equal((await receipt(get('http://localhost/x'), { params: Promise.resolve({ nonce: 'abc' }) })).status, 400);
  assert.equal((await receipt(get('http://localhost/x'), { params: Promise.resolve({ nonce }) })).status, 404);
  store.beginX402Call(db.x402Db(), { nonce, endpoint: 'https://seller.example/pay', payTo: '0x0000000000000000000000000000000000000001', asset: '0x0000000000000000000000000000000000000002', amountRaw: '1', network: 'eip155:56', payer: '0x0000000000000000000000000000000000000003', agentChainId: 56, agentTokenId: '1', at: new Date().toISOString() });
  const found = await receipt(get('http://localhost/x'), { params: Promise.resolve({ nonce }) });
  assert.equal(found.status, 200);
  const summary = ((await found.json()) as { receipt: Record<string, unknown> }).receipt;
  assert.equal(summary.state, 'sending');
  assert.equal('responseText' in summary || 'payer' in summary, false, 'by nonce alone: the outcome, never the answer or the wallet');
});

test('the paid answer comes back only to the wallet that paid', async () => {
  process.env.NEXT_PUBLIC_X402_ENABLED = 'true';
  const { privateKeyToAccount } = await import('viem/accounts');
  const { receiptProofMessage } = await import('../../src/lib/x402/receipt-proof');
  const payer = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const stranger = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
  const paid = '0x' + 'ef'.repeat(32);
  store.beginX402Call(db.x402Db(), { nonce: paid, endpoint: 'https://seller.example/pay', payTo: '0x0000000000000000000000000000000000000001', asset: '0x0000000000000000000000000000000000000002', amountRaw: '1', network: 'eip155:56', payer: payer.address, agentChainId: 56, agentTokenId: '1', at: new Date().toISOString() });
  store.finishX402Call(db.x402Db(), paid, { state: 'answered', httpStatus: 200, settlementTx: null, responseText: '{"secret":"answer"}', error: null, at: new Date().toISOString() });
  const post = receiptPost;
  const ask = async (signature: string) => post(new Request('http://localhost/x', { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.9' }, body: JSON.stringify({ signature }) }), { params: Promise.resolve({ nonce: paid }) });
  assert.equal((await ask(await stranger.signMessage({ message: receiptProofMessage(paid) }))).status, 403);
  const mine = await ask(await payer.signMessage({ message: receiptProofMessage(paid) }));
  assert.equal(mine.status, 200);
  assert.equal(((await mine.json()) as { receipt: { responseText: string } }).receipt.responseText, '{"secret":"answer"}');
});
