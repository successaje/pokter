import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECENT_SWEEP_MS,
  SWEEP_BUDGET_MS,
  SWEEP_FIRST_TICK_MS,
  SWEEP_INTERVAL_MS,
  SWEEP_RUN_BUDGET_MS,
  SWEEP_TICK_MS,
  registryPageOffset,
  staleAlertDue,
  sweepBatch,
  sweepDue,
  sweepRecent,
} from '../src/lib/history/schedule';

const NOW = Date.parse('2026-10-15T13:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

test('a sweep is due once the floor has passed since the last one started', () => {
  const floor = SWEEP_INTERVAL_MS / 60_000;
  assert.equal(sweepDue(minsAgo(floor - 1), NOW), false);
  assert.equal(sweepDue(minsAgo(floor), NOW), true);
  assert.equal(sweepDue(null, NOW), true, 'a process that has never swept sweeps now');
});

test('a threshold equal to the gap it is tested against halves the rate', () => {
  /*
   * Both halves of the cadence bug, stated with local numbers so it keeps
   * documenting the reasoning whatever the shipped constants become.
   *
   * Measured in production twice: runs eighteen minutes apart on a
   * ten-minute schedule, first because the age was taken from a run's finish
   * rather than its start, and then because the floor was equal to the gap
   * between ticks. Either way a tick lands a hair short of due, the sweep
   * slips to the one after, and the rate halves without anything failing.
   */
  const tick = 10 * 60_000;
  const run = 150_000; // a real one: mainnet at ~12:39:28, testnet at ~12:40:07
  const iso = (t: number) => new Date(t).toISOString();
  const due = (lastAt: number, now: number, floor: number) => now - lastAt >= floor;

  // Taken from the finish, with the floor equal to the tick: never due.
  assert.equal(due(NOW + run, NOW + tick, tick), false, 'short by the length of the run');
  // Taken from the start, floor still equal to the tick: due only if the
  // tick is not a millisecond early, which is a coin flip, not a schedule.
  assert.equal(due(NOW, NOW + tick, tick), true);
  assert.equal(due(NOW, NOW + tick - 1, tick), false, 'a hair early and the tick is wasted');
  // Taken from the start with a floor below the gap: due with room to spare.
  assert.equal(due(NOW, NOW + tick - 1, tick - 60_000), true);

  // Which is what the shipped configuration does, via the real function.
  assert.equal(sweepDue(iso(NOW), NOW + SWEEP_TICK_MS - SWEEP_FIRST_TICK_MS), true);
});

test('a backup trigger stands down only inside its own window', () => {
  const window = RECENT_SWEEP_MS / 60_000;
  assert.equal(sweepRecent(minsAgo(window - 1), NOW), true);
  assert.equal(sweepRecent(minsAgo(window + 1), NOW), false);
  assert.equal(sweepRecent(null, NOW), false, 'never swept is not recently swept');

  // The relationship that matters: the route checks this, and the scheduler
  // goes through the route, so a sweep the scheduler calls due must never be
  // one the route calls recent.
  const atFloor = minsAgo(SWEEP_INTERVAL_MS / 60_000);
  assert.equal(sweepDue(atFloor, NOW), true);
  assert.equal(sweepRecent(atFloor, NOW), false, 'the route must not veto a due sweep');
});

test('six hours without a sweep alerts once per outage', () => {
  // 15 October: last sweep 04:43, nothing until a manual run at 12:52.
  const last = '2026-10-15T04:43:16Z';
  assert.equal(staleAlertDue(last, null, Date.parse('2026-10-15T10:00:00Z')), false);
  assert.equal(staleAlertDue(last, null, Date.parse('2026-10-15T10:44:00Z')), true);
  // Already alerted during this outage: not again.
  assert.equal(staleAlertDue(last, '2026-10-15T10:44:00Z', Date.parse('2026-10-15T12:00:00Z')), false);
  // A later outage, after sweeps resumed, alerts again.
  assert.equal(staleAlertDue('2026-10-16T00:00:00Z', '2026-10-15T10:44:00Z', Date.parse('2026-10-16T07:00:00Z')), true);
});

test('a bounded sweep measures the agents whose readings are oldest', () => {
  const roster = [{ tokenId: 'a' }, { tokenId: 'b' }, { tokenId: 'c' }, { tokenId: 'd' }];
  const lastProbed = new Map([
    ['a', minsAgo(5)],
    ['b', minsAgo(600)],
    ['c', minsAgo(90)],
    // 'd' has never been probed.
  ]);

  assert.deepEqual(
    sweepBatch(roster, lastProbed, 2).map((e) => e.tokenId),
    ['d', 'b'],
    'never probed first, then the oldest reading',
  );
  assert.deepEqual(
    sweepBatch(roster, lastProbed, 10).map((e) => e.tokenId),
    ['d', 'b', 'c', 'a'],
    'a batch larger than the roster takes all of it, still stalest first',
  );
  assert.deepEqual(sweepBatch(roster, lastProbed, 0), []);
});

test('successive bounded sweeps cover the roster', () => {
  // The property the batching exists for: no run walks the whole roster, and
  // every agent is reached within a few runs because being measured is what
  // moves an agent to the back of the queue.
  const roster = Array.from({ length: 9 }, (_, i) => ({ tokenId: `a${i}` }));
  const lastProbed = new Map<string, string>();
  const reached = new Set<string>();

  for (let run = 0; run < 3; run += 1) {
    const batch = sweepBatch(roster, lastProbed, 3);
    assert.equal(batch.length, 3, 'a run never takes more than its batch');
    for (const entry of batch) {
      reached.add(entry.tokenId);
      lastProbed.set(entry.tokenId, new Date(NOW + run * 60_000).toISOString());
    }
  }

  assert.equal(reached.size, 9, 'three runs of three cover a roster of nine exactly once');
});

test('a run that measured nothing leaves the queue where it was', () => {
  // A sweep cut short by its budget records no reading for the agents it
  // skipped, so the next run starts with the same ones rather than moving on.
  const roster = [{ tokenId: 'x' }, { tokenId: 'y' }, { tokenId: 'z' }];
  const lastProbed = new Map<string, string>();
  const first = sweepBatch(roster, lastProbed, 2).map((e) => e.tokenId);
  assert.deepEqual(sweepBatch(roster, lastProbed, 2).map((e) => e.tokenId), first);
});

test('the registry page advances once per run and wraps', () => {
  const depth = 150;
  const t = (ticks: number) => registryPageOffset(ticks * SWEEP_TICK_MS, depth);

  assert.deepEqual([t(0), t(1), t(2), t(3), t(4)], [0, 50, 100, 0, 50], 'three pages, then round again');
  // Within one tick the page is stable, so a retry in the same window reads
  // the same page rather than skipping one.
  assert.equal(registryPageOffset(SWEEP_TICK_MS + 59_000, depth), 50);
});

test('a registry depth of one page or less never rotates', () => {
  // The testnet pass reads 50, so its offset must stay at 0 — a rotation
  // there would read past the depth it was given and find nothing.
  const t = (ticks: number) => registryPageOffset(ticks * SWEEP_TICK_MS, 50);
  assert.deepEqual([t(0), t(1), t(7)], [0, 0, 0]);
  assert.equal(registryPageOffset(0, 0), 0, 'and a depth of none does not divide by zero');
});

test('the run budget stays inside the platform ceiling and the tick', () => {
  // Both constraints are stated in the constant's own doc; asserting them
  // here is what stops a later nudge to either number from reintroducing
  // the shape of the 19 October outage — a run with no room to answer in,
  // or two runs sharing one CPU.
  const MAX_DURATION_MS = 300_000; // route: `export const maxDuration = 300`
  assert.ok(
    SWEEP_RUN_BUDGET_MS < MAX_DURATION_MS,
    'a run must finish early enough to report what it did',
  );
  // Runs start on the tick, so the budget has to fit inside the tick — and by
  // more than a hair, since the machine also has a site to serve.
  assert.ok(
    SWEEP_RUN_BUDGET_MS * 2 <= SWEEP_TICK_MS,
    'a run must finish well inside the gap before the next one starts',
  );
  // And the probing share must leave the follow-on steps something to use.
  assert.ok(SWEEP_BUDGET_MS * 2 < SWEEP_RUN_BUDGET_MS, 'probing cannot claim the whole run');
});

test('the due floor clears the tightest gap between ticks', () => {
  /*
   * The half of the cadence bug that pacing from run starts did not fix.
   *
   * The scheduler wakes on a fixed tick and sweeps when a sweep is due, so
   * the cadence is the tick and this interval is only a floor against double
   * sweeping. Set equal to the gap it is tested against, every tick lands a
   * hair short of due and the sweep slips to the next one — a ten-minute
   * schedule running at eighteen, decided by timer drift, failing silently
   * towards half the intended rate.
   *
   * The tightest gap is the first one, because `setInterval` is anchored to
   * boot rather than to the first timer: tick one is at `SWEEP_FIRST_TICK_MS`
   * and tick two at `SWEEP_TICK_MS`, so they are a minute closer together
   * than every pair after them.
   */
  const tightestGap = SWEEP_TICK_MS - SWEEP_FIRST_TICK_MS;

  assert.ok(
    SWEEP_INTERVAL_MS < tightestGap,
    `the floor (${SWEEP_INTERVAL_MS / 60_000}m) must clear the first gap (${tightestGap / 60_000}m), or that tick never sweeps`,
  );
  // Not merely under it: a threshold a few seconds below a gap is still
  // decided by drift. A minute of slack is what stops this being arithmetic
  // that happens to work today.
  assert.ok(
    tightestGap - SWEEP_INTERVAL_MS >= 60_000,
    'the floor needs real slack under the tightest gap, not a hair',
  );

  // And the backup trigger's stand-down window must not outlast the floor,
  // or GitHub's cron would refuse sweeps the scheduler considers due.
  assert.ok(RECENT_SWEEP_MS <= SWEEP_INTERVAL_MS, 'the backup must not veto a due sweep');
});

test('every tick sweeps, once the floor clears the gaps', () => {
  // Walking the real timer grid: boot, first tick a minute later, then
  // `setInterval` from boot. Every tick after the first must find a sweep
  // due, or the cadence is not the tick.
  const boot = 0;
  const ticks = [boot + SWEEP_FIRST_TICK_MS, boot + SWEEP_TICK_MS, boot + 2 * SWEEP_TICK_MS, boot + 3 * SWEEP_TICK_MS];

  let lastRunStartedAt: string | null = null;
  const swept: number[] = [];
  for (const tick of ticks) {
    if (!sweepDue(lastRunStartedAt, tick)) continue;
    swept.push(tick);
    lastRunStartedAt = new Date(tick).toISOString();
  }

  assert.deepEqual(swept, ticks, 'no tick is skipped');
  // Which makes the spacing the tick period, apart from the boot offset.
  assert.equal(swept[2] - swept[1], SWEEP_TICK_MS);
  assert.equal(swept[3] - swept[2], SWEEP_TICK_MS);
});
