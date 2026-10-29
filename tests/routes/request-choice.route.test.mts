import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * Proposing below an agent's signed price, and changing a choice, against
 * stores of their own. Run under the server conditions because the stores
 * are `server-only`. Only the refusals that come before any wallet or
 * registry check are exercised here; the order of the checks is asserted
 * from source in tests/proposal-price.test.mts.
 */

const dir = mkdtempSync(join(tmpdir(), 'pokter-request-choice-'));
process.env.BRIEF_DB_PATH = join(dir, 'briefs.db');
process.env.JOB_DB_PATH = join(dir, 'jobs.db');
process.env.PROBE_DB_PATH = join(dir, 'probes.db');
process.env.RATE_LIMIT_DB_PATH = join(dir, 'rate-limit.db');

const TEST_U = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565' as const;
const POSTER = '0x00000000000000000000000000000000000000aa' as const;
const BIDDER = '0x00000000000000000000000000000000000000bb' as const;

const { getBriefStore } = await import('../../src/lib/briefs/store');
const store = getBriefStore();
const request = (id: string) => ({
  id,
  title: 'Health factor',
  brief: 'Work it out.',
  acceptance: ['Gives the number.'],
  failSignals: [],
  budgetU: 1,
  budgetRaw: '1000000000000000000',
  paymentToken: TEST_U,
  chainId: 97,
  deliverDays: 3,
  poster: POSTER,
  signature: '0xsig' as const,
  state: 'open' as const,
  postedAt: new Date(Date.now() - 3_600_000).toISOString(),
  awardedBidId: null,
  closesAt: null,
  category: null,
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (path: string, body: unknown) => new Request(`https://pokter.xyz${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a proposal below the price the agent signs is refused, with the price to propose', async () => {
  const { getProbeStore } = await import('../../src/lib/history/store');
  const { POST } = await import('../../src/app/api/briefs/[id]/bids/route');
  const id = '11111111-1111-4111-8111-111111111111';
  store.add(request(id));
  getProbeStore().recordQuotes([{ chainId: 97, tokenId: '2554', priceRaw: '100000000000000000', priceU: 0.1, currency: TEST_U.toLowerCase(), signer: BIDDER, quotedAt: new Date().toISOString(), expiresAt: null, domain: null }]);

  const response = await POST(post(`/api/briefs/${id}/bids`, { bidder: BIDDER, signature: '0x01', placedAt: new Date().toISOString(), content: { agentChainId: 97, agentTokenId: '2554', priceU: 0.05, paymentToken: TEST_U, deliverDays: 2, note: 'How.' } }), params(id));
  assert.equal(response.status, 422);
  const { error } = (await response.json()) as { error: string };
  assert.match(error, /Propose at least 0\.1 /);
  assert.equal(store.bidsFor(id).length, 0, 'nothing was stored');
});

test('a choice can be changed until it is funded, and only from the choice it undoes', async () => {
  const { getJobStore } = await import('../../src/lib/erc8183/store');
  const { POST } = await import('../../src/app/api/briefs/[id]/reopen/route');
  const id = '22222222-2222-4222-8222-222222222222';
  const placedAt = new Date(Date.now() - 1_800_000).toISOString();
  store.add(request(id));
  store.placeBid({ id: 'chosen', briefId: id, agentChainId: 97, agentTokenId: '2554', priceU: 0.1, paymentToken: TEST_U, priceRaw: '100000000000000000', deliverDays: 2, note: 'How.', bidder: BIDDER, signature: '0xbidsig', placedAt });
  const fresh = () => ({ signature: '0x01', decidedAt: new Date().toISOString() });

  assert.equal((await POST(post(`/api/briefs/${id}/reopen`, fresh()), params(id))).status, 409, 'nothing chosen yet');
  store.award(id, 'chosen');
  assert.equal((await POST(post(`/api/briefs/${id}/reopen`, { signature: '0x01', decidedAt: new Date(Date.now() - 20 * 60_000).toISOString() }), params(id))).status, 400, 'an old signature is not a decision made now');

  getJobStore().record({
    id: '97:1700',
    jobId: '1700',
    chainId: 97,
    isTestnet: true,
    agentChainId: 97,
    agentTokenId: '2554',
    agentName: 'Agent',
    provider: BIDDER,
    client: POSTER,
    task: 'brief',
    paymentToken: TEST_U,
    budgetRaw: '100000000000000000',
    expiredAt: new Date(Date.now() + 86_400_000).toISOString(),
    hiredAt: new Date().toISOString(),
    hireTxHash: null,
    status: 'FUNDED',
    statusCheckedAt: new Date().toISOString(),
    deliverableUrl: null,
    settleTxHash: null,
  });
  const funded = await POST(post(`/api/briefs/${id}/reopen`, fresh()), params(id));
  assert.equal(funded.status, 409, 'an agent has been paid to work on it');
  assert.match(((await funded.json()) as { error: string }).error, /funded job/);
  assert.equal(store.get(id)?.state, 'awarded');

  assert.equal(store.reopen(id, 'another'), false, 'not the choice on the request');
  assert.equal(store.reopen(id, 'chosen'), true);
  assert.equal(store.get(id)?.state, 'open');
  assert.equal(store.get(id)?.awardedBidId, null);
  assert.equal(store.reopen(id, 'chosen'), false, 'a second change has nothing to undo');
});
