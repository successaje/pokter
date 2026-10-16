import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canSettle, canSettleAs, disputeSummary, reviewWindowSummary,
  sellerReleaseSummary, settleCallerAllowed, settleOpensAt,
} from '../src/lib/erc8183/settle-window';

/* Job 1440 on BNB testnet, the one that produced the gas error. */
const SUBMITTED = 1791795365;          // 2026-10-12T08:56:05Z
const WINDOW = 900;                    // the policy's disputeWindow
const EXPIRES = 1791881637;            // 2026-10-13T08:53:57Z

const timing = (now: number, over = {}) => ({
  submittedAt: SUBMITTED,
  expiredAt: EXPIRES,
  disputeWindowSeconds: WINDOW,
  now,
  ...over,
});

test('the window opens where the chain says it does', () => {
  assert.equal(settleOpensAt({ submittedAt: SUBMITTED, disputeWindowSeconds: WINDOW }), 1791796265);
});

test('confirming inside the review window is refused, with the wait', () => {
  const verdict = canSettle('approve', timing(SUBMITTED + 60));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason === 'too-early' && verdict.reason, 'too-early');
  if (verdict.allowed === false && verdict.reason === 'too-early') {
    assert.equal(verdict.opensInSeconds, 840);
    assert.match(verdict.message, /14 minutes/);
    /* Never mentions gas, which is what the buyer was shown instead. */
    assert.ok(!/gas/i.test(verdict.message), verdict.message);
  }
});

test('confirming once the window has elapsed is allowed', () => {
  assert.deepEqual(canSettle('approve', timing(SUBMITTED + WINDOW)), { allowed: true });
  assert.deepEqual(canSettle('approve', timing(SUBMITTED + WINDOW + 1)), { allowed: true });
});

test('a job past its deadline points at reclaim, not at waiting', () => {
  const verdict = canSettle('approve', timing(EXPIRES + 1));
  assert.equal(verdict.allowed, false);
  if (verdict.allowed === false) {
    assert.equal(verdict.reason, 'expired');
    assert.match(verdict.message, /reclaim/i);
    assert.ok(!/try again/i.test(verdict.message), 'never tells them to wait');
  }
});

test('expiry outranks the window', () => {
  /* Both conditions true at once: delivered seconds ago, deadline gone.
     Telling somebody to wait when their wait is over is the worse error. */
  const verdict = canSettle('approve', timing(EXPIRES + 1, { submittedAt: EXPIRES - 10 }));
  assert.equal(verdict.allowed === false && verdict.reason, 'expired');
});

test('disputing is the inverse: inside the window only', () => {
  assert.deepEqual(canSettle('dispute', timing(SUBMITTED + 60)), { allowed: true });
  const closed = canSettle('dispute', timing(SUBMITTED + WINDOW + 1));
  assert.equal(closed.allowed, false);
  assert.equal(closed.allowed === false && closed.reason, 'window-closed');
});

test('an undelivered job is not held back by a window that has not started', () => {
  assert.deepEqual(canSettle('approve', timing(SUBMITTED, { submittedAt: 0 })), { allowed: true });
});

test('a week-long window is said in days, with the moment it opens', () => {
  const submittedAt = Date.parse('2026-10-14T18:30:40Z') / 1000;
  const verdict = canSettle('approve', { now: submittedAt + 30 * 60, submittedAt, expiredAt: submittedAt + 8 * 86_400, disputeWindowSeconds: 604_800 });
  assert.equal(verdict.allowed, false);
  if (verdict.allowed === false && verdict.reason === 'too-early') {
    assert.match(verdict.message, /review window of 7 days after delivery/);
    assert.match(verdict.message, /opens 21 Oct, 18:30 UTC \(in 7 days\)/);
    assert.doesNotMatch(verdict.message, /minutes/);
  }
});

test('a delivered job says when its review window closes, and what each side of it allows', () => {
  // Job #57005 on mainnet: submitted 15 Oct 14:14:33 UTC, 7-day window.
  const submittedAt = Date.parse('2026-10-15T14:14:33Z') / 1000;
  const timing = { submittedAt, expiredAt: submittedAt + 8 * 86_400, disputeWindowSeconds: 604_800 };
  const open = reviewWindowSummary({ ...timing, now: submittedAt + 3_600 });
  assert.equal(open.open, true);
  assert.equal(open.closes, '22 Oct, 14:14 UTC');
  assert.match(open.text, /closes 22 Oct, 14:14 UTC \(in 7 days\)/);
  assert.match(open.text, /Until then you can dispute/);
  const closed = reviewWindowSummary({ ...timing, now: submittedAt + 604_800 + 60 });
  assert.equal(closed.open, false);
  assert.match(closed.text, /closed 22 Oct, 14:14 UTC/);
});

test('a disputed job says how the vote stands and both ways it ends', () => {
  // Job #56997: disputed 15 Oct, deadline 22 Oct 18:28 UTC, quorum 3, no votes yet.
  const expiredAt = Date.parse('2026-10-22T18:28:00Z') / 1000;
  const open = disputeSummary({ rejectVotes: 0, quorum: 3, expiredAt, now: expiredAt - 86_400 });
  assert.match(open.text, /0 of 3 reject votes so far/);
  assert.match(open.text, /At 3 the job is rejected/);
  assert.match(open.text, /deadline, 22 Oct, 18:28 UTC, the job expires and you reclaim it then/);
  const over = disputeSummary({ rejectVotes: 1, quorum: 3, expiredAt, now: expiredAt + 60 });
  assert.match(over.text, /did not reach its quorum \(1 of 3/);
});

test('anybody may release an escrow once the review window has closed', () => {
  /*
   * Settled on chain rather than argued. BNB testnet job #1502: buyer
   * 0x9384…EDda, provider 0xB723…051a, and a third address holding nothing
   * but gas, 0x5CbD…07FB, which called Router.settle after the 900-second
   * window and moved 0.1 $U to the provider
   * (0x78900c506b00ac114bc0658c69e39738ee141180e59b9ebc801b940b0a2e1ff6).
   *
   * Which makes Pokter's own promise — "the payment can be released
   * afterwards without you" — a fact rather than a claim.
   */
  for (const caller of ['buyer', 'seller', 'anyone-else'] as const) {
    assert.equal(settleCallerAllowed('approve', caller), true);
  }
});

test('only the buyer may contest a delivery', () => {
  /*
   * The contrast that made the result above legible: inside the window,
   * dispute succeeds for the buyer and refuses everyone else with
   * 0x20dbc874, which is NotClient() by preimage. The contracts have a
   * caller gate and use it — settle simply does not have one.
   */
  assert.equal(settleCallerAllowed('dispute', 'buyer'), true);
  assert.equal(settleCallerAllowed('dispute', 'seller'), false);
  assert.equal(settleCallerAllowed('dispute', 'anyone-else'), false);
});

test('a caller who may never make the call is told that, not asked to wait', () => {
  // "Come back in twelve minutes" to somebody who can never dispute at all
  // is the wrong answer however good the timing maths is.
  const inside = canSettleAs('dispute', 'seller', timing(SUBMITTED + 60));
  assert.equal(inside.allowed, false);
  assert.equal(inside.allowed === false && inside.reason, 'not-your-call');
  assert.match(inside.allowed === false ? inside.message : '', /Only the wallet that funded this job/);
  assert.match(inside.allowed === false ? inside.message : '', /open to anyone/);
});

test('an allowed caller still has to wait for the window', () => {
  // Both halves, or a surface ships a button that reverts.
  const early = canSettleAs('approve', 'anyone-else', timing(SUBMITTED + 60));
  assert.equal(early.allowed === false && early.reason, 'too-early');
  assert.equal(canSettleAs('approve', 'anyone-else', timing(SUBMITTED + WINDOW + 1)).allowed, true);
});

test('the seller sees the same window from the other side', () => {
  /*
   * A seller used to see only "Buyer reviewing" — while that was true, and
   * for ever afterwards. So work nobody was reviewing any more, which they
   * could have collected themselves, looked exactly like work still under
   * review.
   */
  const waiting = sellerReleaseSummary(timing(SUBMITTED + 60));
  assert.equal(waiting.state, 'waiting');
  assert.equal(waiting.label, 'Buyer reviewing');
  assert.match(waiting.text, /can dispute this delivery until/);
  assert.match(waiting.text, /After that you can release the payment to yourself/);

  const ready = sellerReleaseSummary(timing(SUBMITTED + WINDOW + 1));
  assert.equal(ready.state, 'ready');
  assert.equal(ready.label, 'Ready to collect');
  assert.match(ready.text, /you pay the gas, the escrow pays you/);
});

test('a seller is not offered a release that expired out from under them', () => {
  const gone = sellerReleaseSummary(timing(EXPIRES + 1));
  assert.equal(gone.state, 'expired');
  assert.match(gone.text, /budget returns to the buyer/);
});

test('an expiry refusal is addressed to whoever asked', () => {
  /*
   * canSettle speaks to the buyer, so its expiry message offers the budget
   * back. To a seller that reads as their own money being returned to
   * them, which is the opposite of what happened.
   */
  const late = timing(EXPIRES + 1);
  const toBuyer = canSettleAs('approve', 'buyer', late);
  const toSeller = canSettleAs('approve', 'seller', late);
  assert.equal(toBuyer.allowed === false && toBuyer.reason, 'expired');
  assert.equal(toSeller.allowed === false && toSeller.reason, 'expired');
  assert.match(toBuyer.allowed === false ? toBuyer.message : '', /budget is yours to reclaim/);
  assert.match(toSeller.allowed === false ? toSeller.message : '', /budget returns to the buyer/);
});
