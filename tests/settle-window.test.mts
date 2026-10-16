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

test('a delivered job can still be settled after its deadline', () => {
  /*
   * There used to be a deadline rule here, on the evidence of jobs 1202
   * and 1217. Those revert PolicyNotSet: they were never registered with a
   * policy. The deployed kernel's complete has no deadline check, so a job
   * still SUBMITTED past its deadline settles as the policy decided, unless
   * the buyer reclaims it first.
   */
  assert.deepEqual(canSettle('approve', timing(EXPIRES + 1)), { allowed: true });
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

test('a disputed job is decided inside the review window, as the deployed policy decides it', () => {
  /*
   * Job #56997: delivered 15 Oct, review window to 22 Oct 14:14 UTC,
   * quorum 3. The audited OptimisticPolicy accepts votes only inside the
   * window; reaching quorum settles as rejected (refund), and missing it
   * falls through to approved. Pokter said a dispute without quorum
   * expires and refunds, which was an earlier contract.
   */
  const windowClosesAt = Date.parse('2026-10-22T14:14:00Z') / 1000;
  const expiredAt = Date.parse('2026-10-22T18:28:00Z') / 1000;
  const voting = disputeSummary({ rejectVotes: 0, quorum: 3, windowClosesAt, expiredAt, now: windowClosesAt - 86_400 });
  assert.equal(voting.outcome, 'voting');
  assert.match(voting.text, /until the review window closes, 22 Oct, 14:14 UTC/);
  assert.match(voting.text, /0 of 3 reject votes so far/);
  assert.match(voting.text, /the dispute fails when the window closes and the agent can be paid/);

  const failed = disputeSummary({ rejectVotes: 1, quorum: 3, windowClosesAt, expiredAt, now: windowClosesAt + 60 });
  assert.equal(failed.outcome, 'failed');
  assert.match(failed.text, /settling the job pays the agent/);

  // Quorum reached: rejected, whenever it is read, and settling refunds.
  const rejected = disputeSummary({ rejectVotes: 3, quorum: 3, windowClosesAt, expiredAt, now: windowClosesAt + 60 });
  assert.equal(rejected.outcome, 'rejected');
  assert.match(rejected.text, /Settling the job now refunds your escrow/);
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

test('past the deadline a seller is told to collect, not that it is gone', () => {
  /*
   * The kernel's `complete` has no deadline check, so a delivered job still
   * SUBMITTED settles as the policy decided however late it is — unless the
   * buyer reclaims first. It is a race, not an expiry, and a seller told
   * their money was gone would leave money they could still have taken.
   */
  const late = sellerReleaseSummary(timing(EXPIRES + 1));
  assert.equal(late.state, 'racing');
  assert.equal(late.label, 'Collect now');
  assert.match(late.text, /buyer can reclaim the budget at any moment/);
  assert.match(late.text, /will still pay you until they do/);

  // And the escrow agrees it is allowed, so the button is not a lie.
  assert.equal(canSettleAs('approve', 'seller', timing(EXPIRES + 1)).allowed, true);
});
