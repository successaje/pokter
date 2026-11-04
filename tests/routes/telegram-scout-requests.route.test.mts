import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'pokter-scout-requests-'));
process.env.BRIEF_DB_PATH = join(dir, 'briefs.db');
process.env.JOB_DB_PATH = join(dir, 'jobs.db');
process.env.RATE_LIMIT_DB_PATH = join(dir, 'rate-limit.db');

test('Scout reads open public requests and leaves builder-directed work out of the public list', async () => {
  const { getBriefStore } = await import('../../src/lib/briefs/store');
  const { scoutReply } = await import('../../src/lib/telegram/scout');
  const base = {
    brief: 'Research the token contract.', acceptance: ['A report with sources.'], failSignals: [],
    budgetU: 1, budgetRaw: '1000000000000000000',
    paymentToken: '0x55d398326f99059fF775485246999027B3197955' as const,
    chainId: 56, deliverDays: 3, poster: '0x00000000000000000000000000000000000000aa' as const,
    signature: '0xsig' as const, awardedBidId: null, state: 'open' as const,
    postedAt: '2026-11-04T10:00:00Z', closesAt: null, category: 'research',
  };
  const store = getBriefStore();
  store.add({ ...base, id: '11111111-1111-4111-8111-111111111111', title: 'Public research request', targetBuilder: null });
  store.add({ ...base, id: '22222222-2222-4222-8222-222222222222', title: 'Directed research request', targetBuilder: '0x00000000000000000000000000000000000000bb' });
  const result = await scoutReply('Open requests', true);
  assert.ok(result);
  assert.match(result.text, /Public research request/);
  assert.doesNotMatch(result.text, /Directed research request/);
  assert.match(result.text, /BNB Chain|BNB Mainnet/);
  assert.match(result.text, /not a funded job/);
});
