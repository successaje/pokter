import assert from 'node:assert/strict';
import test from 'node:test';

import { canSettle, disputeSummary, reviewWindowSummary, settleOpensAt } from '../src/lib/erc8183/settle-window';

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
