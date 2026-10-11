import assert from 'node:assert/strict';
import test from 'node:test';

import { mostReliable, orderMarketplace, reliabilityScore, RELIABLE_MIN_PROBES } from '../src/lib/search/order';
import type { SearchableAgent } from '../src/lib/search/match';

function agent(name: string, week: { probes: number; answered: number; medianMs?: number | null }, owner = name, completed = 0): SearchableAgent {
  return {
    listing: {
      agent: { name, token_id: name, chain_id: 97, owner_address: owner },
      attestationCount: 0,
      quote: null,
    },
    record: {
      totalProbes: week.probes,
      totalAnswered: week.answered,
      windows: [{ label: '7d', days: 7, probes: week.probes, answered: week.answered, ratio: week.probes ? week.answered / week.probes : null, medianMs: week.medianMs ?? null }],
    },
    history: { jobs: completed, completed },
  } as unknown as SearchableAgent;
}

const names = (xs: SearchableAgent[]) => xs.map((x) => x.listing.agent.name);

test('a longer clean record outranks a shorter one at the same rate', () => {
  const long = agent('62-of-62', { probes: 62, answered: 62 });
  const short = agent('25-of-25', { probes: 25, answered: 25 });
  assert.deepEqual(names(orderMarketplace([short, long], 'reliable')), ['62-of-62', '25-of-25']);
});

test('too few probes this week is unranked, not ranked low, and sorts after ranked agents', () => {
  const lucky = agent('3-of-3', { probes: 3, answered: 3 });
  const patchy = agent('patchy', { probes: 40, answered: 30 });
  assert.equal(reliabilityScore(lucky), null);
  assert.equal(reliabilityScore(agent('edge', { probes: RELIABLE_MIN_PROBES, answered: RELIABLE_MIN_PROBES })) !== null, true);
  assert.deepEqual(names(orderMarketplace([lucky, patchy], 'reliable')), ['patchy', '3-of-3']);
});

test('a missed probe costs more than a slower answer', () => {
  const steadySlow = agent('steady-slow', { probes: 62, answered: 62, medianMs: 900 });
  const fastFlaky = agent('fast-flaky', { probes: 62, answered: 58, medianMs: 80 });
  assert.deepEqual(names(orderMarketplace([fastFlaky, steadySlow], 'reliable')), ['steady-slow', 'fast-flaky']);
});

test('equal records break the tie on speed, then on completed paid work', () => {
  const fast = agent('fast', { probes: 62, answered: 62, medianMs: 120 });
  const slow = agent('slow', { probes: 62, answered: 62, medianMs: 400 });
  assert.deepEqual(names(orderMarketplace([slow, fast], 'reliable')), ['fast', 'slow']);
  const worked = agent('worked', { probes: 62, answered: 62, medianMs: 200 }, 'w', 2);
  const idle = agent('idle', { probes: 62, answered: 62, medianMs: 200 }, 'i', 0);
  assert.deepEqual(names(orderMarketplace([idle, worked], 'reliable')), ['worked', 'idle']);
});

test('the strip shows one agent per operator', () => {
  const a1 = agent('op-a-1', { probes: 62, answered: 62, medianMs: 100 }, '0xA');
  const a2 = agent('op-a-2', { probes: 62, answered: 62, medianMs: 110 }, '0xa');
  const b = agent('op-b', { probes: 62, answered: 61 }, '0xB');
  assert.deepEqual(names(mostReliable([a1, a2, b], 5)), ['op-a-1', 'op-b']);
});

test('an agent that lets more paid jobs lapse than it delivers ranks after the rest, and stays off the strip', () => {
  const lapsing = agent('answers-but-lapses', { probes: 62, answered: 62, medianMs: 30 }, 'l');
  (lapsing as unknown as { history: object }).history = { jobs: 3, completed: 0, delivered: 0, missed: 3 };
  const steady = agent('steady', { probes: 62, answered: 60, medianMs: 300 }, 's');
  assert.deepEqual(names(orderMarketplace([lapsing, steady], 'reliable')), ['steady', 'answers-but-lapses']);
  assert.deepEqual(names(mostReliable([lapsing, steady], 5)), ['steady']);
  const recovered = agent('one-miss-two-delivered', { probes: 62, answered: 62 }, 'r');
  (recovered as unknown as { history: object }).history = { jobs: 3, completed: 2, delivered: 2, missed: 1 };
  assert.deepEqual(names(mostReliable([recovered], 5)), ['one-miss-two-delivered']);
});
