import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * The cross-device attempt record through its route, on a real store. Only
 * writes are exercised: the reads that reach the chain are covered with
 * injected readers in tests/hire-recovery.test.mts.
 */
const dir = mkdtempSync(join(tmpdir(), 'pokter-attempts-'));
process.env.JOB_DB_PATH = join(dir, 'jobs.db');
process.env.RATE_LIMIT_DB_PATH = join(dir, 'rate-limit.db');

const pick = <T,>(m: unknown, name: string): T => ((m as Record<string, unknown>)[name] ?? (m as { default: Record<string, unknown> }).default[name]) as T;
const POST = pick<(r: Request) => Promise<Response>>(await import('../../src/app/api/hire/attempts/route'), 'POST');

const WALLET = '0xdAb12cf15F4385188bE62bda9F00877AF4C1b32f';
const post = (body: Record<string, unknown>, ip = '198.51.100.20') => POST(new Request('http://localhost/api/hire/attempts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) }));
const begin = (secret: string) => post({ action: 'begin', wallet: WALLET, chainId: 97, secret, provider: '0x93847647d7eb72a69E162117df6a8697dF53EDda', description: 'd', token: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', amountRaw: '10000000000000000', predictedJobId: '100' });

test('a record without chain evidence never holds a wallet: the next device replaces it; only its secret can update or close it', async () => {
  const first = await begin('device-A-secret-0001');
  assert.equal(first.status, 200);
  assert.equal((await post({ action: 'close', wallet: WALLET, chainId: 97, secret: 'device-B-secret-0002', reason: 'nothing-sent' })).status, 404, 'another device cannot close it');
  assert.equal((await post({ action: 'update', wallet: WALLET, chainId: 97, secret: 'device-B-secret-0002', jobId: '1' })).status, 404);
  /* Anyone could have posted A: unverified, so B replaces it rather than being refused. */
  assert.equal((await begin('device-B-secret-0002')).status, 200, 'an unverified record is superseded');
  assert.equal((await post({ action: 'update', wallet: WALLET, chainId: 97, secret: 'device-A-secret-0001', prompt: 'funding' })).status, 404, 'the replaced record is closed');
  assert.equal((await post({ action: 'close', wallet: WALLET, chainId: 97, secret: 'device-B-secret-0002', reason: 'funded' })).status, 200);
});

test('a verified record does hold the wallet across devices', async () => {
  assert.equal((await begin('device-C-secret-0003')).status, 200);
  const { getJobStore } = await import('../../src/lib/erc8183/store');
  const store = getJobStore();
  const open = store.openFundingAttempt(WALLET.toLowerCase(), 97)!;
  store.updateFundingAttempt(open.publicId, { verified: true }, new Date().toISOString());
  const refused = await begin('device-D-secret-0004');
  assert.equal(refused.status, 409);
  const conflict = (await refused.json()) as { open: Record<string, unknown> };
  assert.equal(conflict.open.verified, true);
  assert.ok(!('description' in conflict.open), 'the brief is not shown to another device');
  assert.equal((await post({ action: 'close', wallet: WALLET, chainId: 97, secret: 'device-C-secret-0003', reason: 'funded' })).status, 200);
});

test('a prompt outside the known steps and an absurd expiry are ignored', async () => {
  assert.equal((await begin('device-E-secret-0005')).status, 200);
  assert.equal((await post({ action: 'update', wallet: WALLET, chainId: 97, secret: 'device-E-secret-0005', prompt: 'anything', fundableUntil: 9_999_999_999_999 })).status, 200);
  const { getJobStore } = await import('../../src/lib/erc8183/store');
  const open = getJobStore().openFundingAttempt(WALLET.toLowerCase(), 97)!;
  assert.equal(open.prompt, null);
  assert.equal(open.fundableUntil, null);
  assert.equal((await post({ action: 'close', wallet: WALLET, chainId: 97, secret: 'device-E-secret-0005', reason: 'nothing-sent' })).status, 200);
});

test('malformed writes are refused before anything is stored', async () => {
  assert.equal((await post({ action: 'begin', wallet: 'not-a-wallet', chainId: 97, secret: 'x'.repeat(20) })).status, 400);
  assert.equal((await post({ action: 'begin', wallet: WALLET, chainId: 1, secret: 'x'.repeat(20) })).status, 400);
  assert.equal((await post({ action: 'begin', wallet: WALLET, chainId: 56, secret: 'short' })).status, 400);
  assert.equal((await post({ action: 'begin', wallet: WALLET, chainId: 56, secret: 'y'.repeat(20) })).status, 400, 'begin needs its terms');
});
