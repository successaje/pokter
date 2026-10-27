import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * GET /api/v1/requests and /requests/{id}, against a store of their own.
 * Run under the server conditions because the stores are `server-only`.
 */

const dir = mkdtempSync(join(tmpdir(), 'pokter-requests-api-'));
process.env.BRIEF_DB_PATH = join(dir, 'briefs.db');
process.env.JOB_DB_PATH = join(dir, 'jobs.db');
const USDT56 = '0x55d398326f99059fF775485246999027B3197955' as const;

test('the board as data: open requests, in their own token, and one in full without signatures', async () => {
  const { getBriefStore } = await import('../../src/lib/briefs/store');
  const { GET: list } = await import('../../src/app/api/v1/requests/route');
  const { GET: one } = await import('../../src/app/api/v1/requests/[id]/route');
  const store = getBriefStore();
  const base = { brief: 'Work it out.', acceptance: ['Gives the number.'], failSignals: [], paymentToken: USDT56, chainId: 56, deliverDays: 3, poster: '0x00000000000000000000000000000000000000aa' as const, signature: '0xsig' as const, awardedBidId: null };
  store.add({ ...base, id: '11111111-1111-4111-8111-111111111111', title: 'Open one', budgetU: 0.5, budgetRaw: '500000000000000000', state: 'open', postedAt: '2026-10-26T12:00:00Z', closesAt: null, category: 'health-factor' });
  store.add({ ...base, id: '22222222-2222-4222-8222-222222222222', title: 'Closed one', budgetU: 0.5, budgetRaw: '500000000000000000', state: 'open', postedAt: '2026-10-20T12:00:00Z', closesAt: '2026-10-21T12:00:00Z', category: 'yield' });
  store.placeBid({ id: 'b1', briefId: '11111111-1111-4111-8111-111111111111', agentChainId: 56, agentTokenId: '269228', priceU: 0.4, paymentToken: USDT56, priceRaw: '400000000000000000', deliverDays: 2, note: 'How.', bidder: '0x00000000000000000000000000000000000000bb', signature: '0xbidsig', placedAt: '2026-10-27T09:00:00Z' });

  const open = (await (await list(new Request('https://pokter.xyz/api/v1/requests'))).json()) as { total: number; requests: Array<{ id: string; budget: { label: string; token: string }; proposals: number; status: string }> };
  assert.equal(open.total, 1, 'a request past its closing date is not work anybody can win');
  assert.equal(open.requests[0].budget.label, '0.5 USDT');
  assert.equal(open.requests[0].proposals, 1);
  assert.equal(open.requests[0].status, 'Taking proposals');

  const all = (await (await list(new Request('https://pokter.xyz/api/v1/requests?status=all'))).json()) as { total: number };
  assert.equal(all.total, 2);
  assert.equal((await list(new Request('https://pokter.xyz/api/v1/requests?chain=1'))).status, 400);
  assert.equal((await list(new Request('https://pokter.xyz/api/v1/requests?category=nope'))).status, 400);

  const response = await one(new Request('https://pokter.xyz/api/v1/requests/11111111-1111-4111-8111-111111111111'), { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /0xsig|0xbidsig/);
  const detail = JSON.parse(body) as { request: { acceptance: string[]; proposalsList: Array<{ price: { label: string } }> } };
  assert.deepEqual(detail.request.acceptance, ['Gives the number.']);
  assert.equal(detail.request.proposalsList[0].price.label, '0.4 USDT');
  assert.equal((await one(new Request('https://pokter.xyz/api/v1/requests/nope'), { params: Promise.resolve({ id: 'nope' }) })).status, 404);
});
