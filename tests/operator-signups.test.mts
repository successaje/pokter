import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSignupReport, walletCohort } from '../src/lib/ops/signups';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const TEAM = new Set(['0x00000000000000000000000000000000000000aa']);
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

test('team wallets are counted apart, each wallet once, by when it first appeared', () => {
  const cohort = walletCohort(
    [
      { wallet: '0x00000000000000000000000000000000000000AA', firstAt: daysAgo(1) },
      { wallet: '0x00000000000000000000000000000000000000bb', firstAt: daysAgo(40) },
      { wallet: '0x00000000000000000000000000000000000000BB', firstAt: daysAgo(2) },
      { wallet: '0x00000000000000000000000000000000000000cc', firstAt: daysAgo(10) },
      { wallet: '0x00000000000000000000000000000000000000dd', firstAt: daysAgo(3) },
      { wallet: null, firstAt: daysAgo(1) },
    ],
    TEAM,
    NOW,
  );
  assert.deepEqual(cohort, { total: 4, outside: 3, outsideNew7d: 1, outsideNew30d: 2 }, 'bb first appeared 40 days ago, so it is not new');
});

test('the report says how many, and nothing about who', () => {
  const report = buildSignupReport({
    profiles: [{ wallet: '0x00000000000000000000000000000000000000bb', signedAt: daysAgo(1), handle: true }],
    buildingSignIns: [{ wallet: '0x00000000000000000000000000000000000000aa', firstAt: daysAgo(5) }],
    posters: [{ wallet: '0x00000000000000000000000000000000000000bb', firstAt: daysAgo(6) }],
    bidders: [],
    buyers: [{ wallet: undefined, firstAt: daysAgo(1) }, { wallet: '0x00000000000000000000000000000000000000cc', firstAt: daysAgo(20) }],
    emails: { distinctVerifiedEmails: 2 },
    team: TEAM,
    now: NOW,
  });
  assert.equal(report.wallets.profiles.withHandle, 1);
  assert.deepEqual(report.wallets.buildingSignIns, { total: 1, outside: 0, outsideNew7d: 0, outsideNew30d: 0 });
  assert.deepEqual(report.wallets.anyOfThese, { total: 3, outside: 2, outsideNew7d: 1, outsideNew30d: 2 });
  assert.doesNotMatch(JSON.stringify(report), /0x0{30}/, 'no address in the output');
});
