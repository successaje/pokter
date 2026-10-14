import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveMaturity } from '../src/lib/agents/maturity';
import type { MaturityFacts } from '../src/lib/agents/maturity';

function facts(overrides: Partial<MaturityFacts> = {}): MaturityFacts {
  return {
    registered: true,
    reachable: false,
    compatible: false,
    tested: false,
    hired: false,
    delivered: false,
    deliveredByOperator: false,
    outsideTeam: { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null },
    probeRate: null,
    observedDays: 0,
    ...overrides,
  };
}

test('a registry entry alone earns only Registered', () => {
  const maturity = deriveMaturity(facts());
  assert.equal(maturity.current, 'registered');
  assert.deepEqual(maturity.steps.filter((step) => step.earned).map((step) => step.id), ['registered']);
});

test('real delivery remains visible even when no category test exists', () => {
  const maturity = deriveMaturity(facts({ reachable: true, compatible: true, hired: true, delivered: true }));
  assert.equal(maturity.current, 'delivered');
  assert.equal(maturity.steps.find((step) => step.id === 'tested')?.earned, false);
});

test('market proof requires both three completions and three outside-team buyers', () => {
  const twoBuyers = deriveMaturity(facts({
    delivered: true,
    outsideTeam: { jobs: 3, completed: 3, terminal: 3, uniqueBuyers: 2, completionRate: 1 },
  }));
  assert.equal(twoBuyers.current, 'delivered');

  const threeBuyers = deriveMaturity(facts({
    delivered: true,
    outsideTeam: { jobs: 3, completed: 3, terminal: 3, uniqueBuyers: 3, completionRate: 1 },
  }));
  assert.equal(threeBuyers.current, 'market-proven');
});

test('reliable operator requires volume, delivery rate and sustained probes', () => {
  const maturity = deriveMaturity(facts({
    reachable: true,
    compatible: true,
    hired: true,
    delivered: true,
    outsideTeam: { jobs: 10, completed: 9, terminal: 10, uniqueBuyers: 4, completionRate: 0.9 },
    probeRate: 0.9,
    observedDays: 30,
  }));
  assert.equal(maturity.current, 'reliable-operator');
});

test('team-funded work cannot contribute because it is absent from outside-team facts', () => {
  const maturity = deriveMaturity(facts({
    hired: true,
    delivered: true,
    outsideTeam: { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null },
  }));
  assert.equal(maturity.current, 'delivered');
  assert.equal(maturity.steps.find((step) => step.id === 'market-proven')?.earned, false);
});

test('a delivery submitted by a Pokter wallet does not earn the agent the milestone', () => {
  const maturity = deriveMaturity(facts({
    reachable: true, compatible: true, hired: true,
    delivered: false, deliveredByOperator: true,
  }));
  assert.equal(maturity.current, 'hired');
  const step = maturity.steps.find((s) => s.id === 'delivered');
  assert.equal(step?.earned, false);
  assert.match(step?.detail ?? '', /Pokter-operated wallet submitted it/);
});

test('the agent delivering its own work still earns the milestone', () => {
  const maturity = deriveMaturity(facts({
    reachable: true, compatible: true, hired: true, delivered: true,
  }));
  assert.equal(maturity.current, 'delivered');
  assert.match(maturity.steps.find((s) => s.id === 'delivered')?.detail ?? '', /own wallet/);
});
