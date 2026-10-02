import assert from 'node:assert/strict';
import test from 'node:test';

import { summariseAdoption } from '../src/lib/builder/adoption';

const OWNER = '0xAbC0000000000000000000000000000000000001';
const d = (iso: string) => Date.parse(iso);
const hire = (client: string, at: string, jobId = client.slice(-4)) => ({
  jobId,
  client,
  completedAtMs: d(at),
});

test('the owner hiring their own agent is not adoption', () => {
  const p = summariseAdoption({
    hires: [
      hire(OWNER, '2026-10-01T10:00:00Z'),
      hire(OWNER.toLowerCase(), '2026-10-02T10:00:00Z', 'b'),
      hire('0x1111111111111111111111111111111111111111', '2026-10-02T11:00:00Z'),
    ],
    actions: [],
    ownerAddresses: [OWNER],
  });

  assert.equal(p.distinctWallets, 2, 'the owner counts once, whatever the casing');
  assert.equal(p.independentWallets, 1);
  assert.equal(p.selfFunded, 1);
  assert.equal(p.hiresMet, false);
});

test('three distinct outside wallets clears the hire bar', () => {
  const p = summariseAdoption({
    hires: [
      hire('0x1111111111111111111111111111111111111111', '2026-10-01T10:00:00Z'),
      hire('0x2222222222222222222222222222222222222222', '2026-10-01T11:00:00Z'),
      hire('0x3333333333333333333333333333333333333333', '2026-10-01T12:00:00Z'),
    ],
    actions: [],
    ownerAddresses: [OWNER],
  });
  assert.equal(p.independentWallets, 3);
  assert.equal(p.hiresMet, true);
});

test('one wallet hiring three times is one wallet', () => {
  const repeat = '0x4444444444444444444444444444444444444444';
  const p = summariseAdoption({
    hires: [
      hire(repeat, '2026-10-01T10:00:00Z', 'a'),
      hire(repeat, '2026-10-02T10:00:00Z', 'b'),
      hire(repeat, '2026-10-03T10:00:00Z', 'c'),
    ],
    actions: [],
    ownerAddresses: [OWNER],
  });
  assert.equal(p.independentWallets, 1);
  assert.equal(p.hiresMet, false, 'the bar is three wallets, not three hires');
});

/*
 * Hires and actions are separate bars. On Pokter today an agent can be hired
 * and still perform nothing, because Pokter's own seller delivers — so a
 * cleared hire bar beside an empty action bar is the normal state, and the
 * counter has to be able to show it.
 */
test('hires cleared and actions empty is a state the counter can express', () => {
  const p = summariseAdoption({
    hires: [
      hire('0x1111111111111111111111111111111111111111', '2026-10-01T10:00:00Z'),
      hire('0x2222222222222222222222222222222222222222', '2026-10-01T11:00:00Z'),
      hire('0x3333333333333333333333333333333333333333', '2026-10-01T12:00:00Z'),
    ],
    actions: [],
    ownerAddresses: [OWNER],
  });
  assert.equal(p.hiresMet, true);
  assert.equal(p.actionsMet, false);
  assert.equal(p.daysMet, false);
});

test('days are counted in UTC, and repeats within one do not add', () => {
  const p = summariseAdoption({
    hires: [],
    actions: [
      { atMs: d('2026-10-01T01:00:00Z') },
      { atMs: d('2026-10-01T23:30:00Z') },
      { atMs: d('2026-10-02T00:30:00Z') },
      { atMs: d('2026-10-03T12:00:00Z') },
      { atMs: d('2026-10-03T13:00:00Z') },
    ],
    ownerAddresses: [OWNER],
  });
  assert.equal(p.actions, 5);
  assert.equal(p.actionsMet, true);
  assert.equal(p.activeDays, 3, 'five actions across three UTC days');
  assert.equal(p.daysMet, true);
});

test('five actions on one day does not clear the day bar', () => {
  const p = summariseAdoption({
    hires: [],
    actions: Array.from({ length: 5 }, (_, i) => ({
      atMs: d(`2026-10-01T0${i}:00:00Z`),
    })),
    ownerAddresses: [OWNER],
  });
  assert.equal(p.actionsMet, true);
  assert.equal(p.activeDays, 1);
  assert.equal(p.daysMet, false);
});

test('an agent with nothing reports zeroes rather than failing', () => {
  const p = summariseAdoption({ hires: [], actions: [], ownerAddresses: [] });
  assert.equal(p.independentWallets, 0);
  assert.equal(p.actions, 0);
  assert.equal(p.activeDays, 0);
  assert.equal(p.selfFunded, 0);
});
