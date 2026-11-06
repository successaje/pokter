import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'pokter-scout-alert-delivery-'));
process.env.SCOUT_DB_PATH = join(dir, 'scout.db');
process.env.BRIEF_DB_PATH = join(dir, 'briefs.db');
process.env.POKTER_TELEGRAM_BOT_TOKEN = 'local-test-token';

test('only a new, still-open public request reaches an opted-in chat once', async () => {
  const { getBriefStore } = await import('../../src/lib/briefs/store');
  const { setRequestAlerts, queuePublicRequestAlert, sendPendingRequestAlerts } = await import('../../src/lib/telegram/request-alerts');
  const base = {
    brief: 'Research a token contract.', acceptance: ['A report with sources.'], failSignals: [],
    budgetU: 1, budgetRaw: '1000000000000000000', paymentToken: null,
    chainId: 97, deliverDays: 3, poster: '0x00000000000000000000000000000000000000aa' as const,
    signature: '0xsig' as const, awardedBidId: null, state: 'open' as const,
    postedAt: new Date().toISOString(), closesAt: new Date(Date.now() + 86400000).toISOString(), category: 'research',
  };
  const request = { ...base, id: '11111111-1111-4111-8111-111111111111', title: 'Research a token', targetBuilder: null };
  getBriefStore().add(request);
  assert.equal(queuePublicRequestAlert(request), 0);
  setRequestAlerts(42, true);
  assert.equal(queuePublicRequestAlert(request), 1);
  assert.equal(queuePublicRequestAlert(request), 0);
  const sent: Array<Record<string, unknown>> = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ ok: true });
  }) as typeof fetch;
  try {
    assert.deepEqual(await sendPendingRequestAlerts(), { sent: 1, failed: 0, dropped: 0 });
    assert.deepEqual(await sendPendingRequestAlerts(), { sent: 0, failed: 0, dropped: 0 });
    assert.equal(sent.length, 1);
    assert.match(String(sent[0].text), /BNB Testnet/);
    assert.match(String(sent[0].text), /test tokens/);
    assert.match(String(sent[0].text), /not a funded job/);
    setRequestAlerts(42, false);
    assert.equal(queuePublicRequestAlert({ ...request, id: '22222222-2222-4222-8222-222222222222' }), 0);
  } finally { globalThis.fetch = oldFetch; }
});
