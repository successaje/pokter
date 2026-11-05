import assert from 'node:assert/strict';
import test from 'node:test';

import { outcomeRecord } from '../src/lib/jobs/outcome-record';
import type { JobEvidence } from '../src/lib/jobs/evidence';

function evidence(): JobEvidence {
  return {
    chainId: 97, jobId: '42', agent: { chainId: 56, tokenId: '7', name: 'Risk reader' },
    escrow: '0xEscrow', chain: { status: 'COMPLETED', client: '0xBuyer', provider: '0xProvider', expiredAt: 0, submittedAt: 0, deliverable: `0x${'a'.repeat(64)}` },
    status: 'COMPLETED', statusSource: 'onchain', statusReadAt: '2026-11-03T00:00:00.000Z',
    provider: '0xProvider', amount: '0.1 test $U', paymentToken: null, funder: 'outside',
    deliveredByPokter: false, paidToCourier: false, hiredAt: '2026-11-02T00:00:00.000Z',
    deliveredAt: '2026-11-02T00:01:00.000Z', expiresAt: null, review: null,
    delivery: { state: 'matches', matchedBy: 'exact', url: null },
    brief: null, answer: null, checks: null, planProof: null, answerWithheld: true,
    receipt: { href: 'https://testnet.bscscan.com/tx/0x123', hash: '0x123' }, fundingTx: null, fundingAt: null,
    attribution: 'onchain-marker', attributionHash: null,
  };
}

test('the portable outcome record never leaks a private brief or answer', () => {
  const e = evidence();
  const record = outcomeRecord(e);
  assert.equal(record.task.brief, 'private');
  assert.equal(record.answerChecks.state, 'answer-private');
  assert.equal(record.delivery.hashMatched, true);
  assert.equal(record.settlement.source, 'onchain');
  assert.equal(record.observedOutcome.state, 'not-measured');
  assert.doesNotMatch(JSON.stringify(record), /0xBuyer|0xProvider|0\.1 test|testnet\.bscscan/);
});

test('a mismatched delivery is not reported as checked or successful', () => {
  const e = { ...evidence(), delivery: { state: 'mismatch', url: null } as JobEvidence['delivery'], answerWithheld: false };
  const record = outcomeRecord(e);
  assert.equal(record.delivery.hashMatched, false);
  assert.equal(record.answerChecks.state, 'not-available');
  assert.equal(record.observedOutcome.state, 'not-measured');
});
