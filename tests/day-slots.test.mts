import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDaySlots, missedDays } from '../src/lib/history/day-slots';
import type { TrackRecord } from '../src/lib/history/record';

const record = (days: { date: string; probes: number; answered: number }[]): TrackRecord => ({
  windows: [],
  days: days.map((d) => ({
    ...d,
    ratio: d.probes === 0 ? null : d.answered / d.probes,
  })),
  firstSeen: days[0]?.date ?? null,
  lastSeen: days[days.length - 1]?.date ?? null,
  totalProbes: days.reduce((n, d) => n + d.probes, 0),
  totalAnswered: days.reduce((n, d) => n + d.answered, 0),
  longestOutage: null,
  observedDays: days.length,
});

/*
 * The bug this exists to stop: `record.days` holds only days that carried
 * probes, so drawing it directly packs a sparse record into a solid run and
 * an agent probed three times across three weeks looks continuously watched.
 */
test('unprobed days inside the span are kept, not closed up', () => {
  const slots = buildDaySlots(
    record([
      { date: '2026-09-01', probes: 4, answered: 4 },
      { date: '2026-09-05', probes: 4, answered: 4 },
    ]),
  );

  assert.equal(slots.length, 5, 'the span is five days, not the two probed');
  assert.deepEqual(
    slots.map((s) => s.date),
    ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'],
  );
  // A day nobody looked at reads as absence, never as a failure.
  assert.deepEqual(
    slots.slice(1, 4).map((s) => ({ probes: s.probes, ratio: s.ratio })),
    [
      { probes: 0, ratio: null },
      { probes: 0, ratio: null },
      { probes: 0, ratio: null },
    ],
  );
});

test('a missed day is one that was probed and fell short', () => {
  const slots = buildDaySlots(
    record([
      { date: '2026-09-01', probes: 4, answered: 4 },
      { date: '2026-09-03', probes: 4, answered: 1 },
      { date: '2026-09-04', probes: 2, answered: 0 },
    ]),
  );

  assert.deepEqual(
    missedDays(slots).map((s) => s.date),
    ['2026-09-03', '2026-09-04'],
    'the unprobed 2nd is not a miss',
  );
});

test('an empty record produces no span rather than a fabricated one', () => {
  assert.deepEqual(buildDaySlots(record([])), []);
});
