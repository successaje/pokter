import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveMaturity, TEAM_FUNDED_ONLY } from '../src/lib/agents/maturity';
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
    deliveredViaPokter: false,
    outsideTeam: { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null },
    probeRate: null,
    observedDays: 0,
    ...overrides,
  };
}

test('a registry entry that has not answered has earned no step', () => {
  const maturity = deriveMaturity(facts());
  assert.equal(maturity.current, null);
  assert.equal(maturity.label, 'Not answering yet');
  assert.deepEqual(maturity.steps.filter((step) => step.earned), []);
});

test('the ladder is the five evidence steps, in order', () => {
  assert.deepEqual(deriveMaturity(facts()).steps.map((step) => step.label), ['Answers', 'Priced', 'Delivered', 'Checked', 'Proven in use']);
  assert.deepEqual(deriveMaturity(facts()).steps.map((step) => step.id), ['answers', 'priced', 'delivered', 'checked', 'proven-in-use']);
});

test('real delivery remains visible even when no category check exists', () => {
  const maturity = deriveMaturity(facts({ reachable: true, compatible: true, hired: true, delivered: true }));
  assert.equal(maturity.current, 'delivered');
  assert.equal(maturity.steps.find((step) => step.id === 'checked')?.earned, false);
});

test('proven in use requires both three completions and three outside-team buyers', () => {
  const twoBuyers = deriveMaturity(facts({
    delivered: true,
    outsideTeam: { jobs: 3, completed: 3, terminal: 3, uniqueBuyers: 2, completionRate: 1 },
  }));
  assert.equal(twoBuyers.current, 'delivered');

  const threeBuyers = deriveMaturity(facts({
    delivered: true,
    outsideTeam: { jobs: 3, completed: 3, terminal: 3, uniqueBuyers: 3, completionRate: 1 },
  }));
  assert.equal(threeBuyers.current, 'proven-in-use');
  assert.equal(threeBuyers.sustained, false);
});

test('a sustained record is a qualifier on proven in use, needing volume, delivery rate and probes', () => {
  const maturity = deriveMaturity(facts({
    reachable: true,
    compatible: true,
    hired: true,
    delivered: true,
    outsideTeam: { jobs: 10, completed: 9, terminal: 10, uniqueBuyers: 4, completionRate: 0.9 },
    probeRate: 0.9,
    observedDays: 30,
  }));
  assert.equal(maturity.current, 'proven-in-use');
  assert.equal(maturity.sustained, true);
  assert.match(maturity.steps.find((step) => step.id === 'proven-in-use')?.detail ?? '', /Sustained: 30 observed days/);
});

test('team-funded work cannot contribute because it is absent from outside-team facts', () => {
  const maturity = deriveMaturity(facts({
    hired: true,
    delivered: true,
    outsideTeam: { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null },
  }));
  assert.equal(maturity.current, 'delivered');
  assert.equal(maturity.steps.find((step) => step.id === 'proven-in-use')?.earned, false);
});

test('a delivery submitted by a Pokter wallet with nothing of the agent in it stays unmet', () => {
  const maturity = deriveMaturity(facts({
    reachable: true, compatible: true, hired: true,
    delivered: false, deliveredByOperator: true,
  }));
  assert.equal(maturity.current, 'priced');
  const step = maturity.steps.find((s) => s.id === 'delivered');
  assert.equal(step?.earned, false);
  assert.equal(step?.state, 'unmet');
  assert.equal(step?.label, 'Delivered');
  assert.match(step?.detail ?? '', /a Pokter wallet submitted it/);
});

test('the agent delivering its own work still earns the step', () => {
  const maturity = deriveMaturity(facts({
    reachable: true, compatible: true, hired: true, delivered: true,
  }));
  assert.equal(maturity.current, 'delivered');
  const step = maturity.steps.find((s) => s.id === 'delivered');
  assert.equal(step?.state, 'earned');
  assert.equal(step?.label, 'Delivered');
  assert.match(step?.detail ?? '', /Agent submitted directly/);
  assert.match(step?.detail ?? '', /own wallet/);
});

/*
 * Job 97/1585: Pokter Evidence answered the brief over A2A, Pokter's
 * courier submitted the manifest, the escrow completed. It used to read
 * "Delivered: false — a Pokter wallet submitted it rather than the agent",
 * which says the buyer went unserved.
 */
test('an answer the agent gave and Pokter carried is a third state, not a failed step', () => {
  const maturity = deriveMaturity(facts({
    reachable: true, compatible: true, hired: true,
    delivered: false, deliveredByOperator: true, deliveredViaPokter: true,
  }));
  const step = maturity.steps.find((s) => s.id === 'delivered');
  assert.equal(step?.state, 'partial', 'neither earned nor absent');
  assert.equal(step?.label, 'Delivered via Pokter', 'the rung says which of the two happened');
  assert.match(step?.detail ?? '', /Answer delivered via Pokter/);
  assert.doesNotMatch(step?.detail ?? '', /rather than the agent/, 'the collapsed wording is gone');

  // The step the agent has actually earned is unchanged: this is not a promotion.
  assert.equal(step?.earned, false);
  assert.equal(maturity.current, 'priced');
  assert.equal(maturity.label, 'Priced');
});

test('the team-funded qualifier survives on both delivery states', () => {
  const direct = deriveMaturity(facts({ reachable: true, compatible: true, hired: true, delivered: true }));
  const relayed = deriveMaturity(facts({
    reachable: true, compatible: true, hired: true, deliveredByOperator: true, deliveredViaPokter: true,
  }));

  /*
   * The qualifier is a fact about the money, so it has to appear whoever
   * submitted. Both of these agents have `outsideTeam.completed === 0`,
   * which is the same zero the proven-in-use step reports as "0/3 settled
   * outside-team jobs" — a delivery line that dropped it would claim a
   * buyer Pokter does not have.
   */
  for (const [state, maturity] of [['direct', direct], ['relayed', relayed]] as const) {
    const detail = maturity.steps.find((s) => s.id === 'delivered')!.detail;
    assert.ok(detail.includes(TEAM_FUNDED_ONLY), `${state} keeps the team-funded qualifier, in the same words`);
    assert.match(
      maturity.steps.find((s) => s.id === 'proven-in-use')!.detail,
      /0\/3 settled outside-team jobs from 0\/3 buyer wallets/,
      `${state} still reports the outside-team counts it is built on`,
    );
  }

  // With an outside buyer settled, neither state claims team-only any more.
  const outside = { jobs: 1, completed: 1, terminal: 1, uniqueBuyers: 1, completionRate: 1 };
  for (const overrides of [{ delivered: true }, { deliveredByOperator: true, deliveredViaPokter: true }]) {
    const detail = deriveMaturity(facts({ reachable: true, compatible: true, hired: true, outsideTeam: outside, ...overrides }))
      .steps.find((s) => s.id === 'delivered')!.detail;
    assert.ok(!detail.includes(TEAM_FUNDED_ONLY));
  }
});

test('an own-wallet delivery outranks a relayed one on the same agent', () => {
  const both = deriveMaturity(facts({
    reachable: true, compatible: true, hired: true, delivered: true,
    deliveredByOperator: true, deliveredViaPokter: true,
  }));
  const step = both.steps.find((s) => s.id === 'delivered');
  assert.equal(step?.state, 'earned');
  assert.equal(step?.label, 'Delivered');
});

test('every step carries a state, and only an earned one advances the ladder', () => {
  for (const step of deriveMaturity(facts({ reachable: true, compatible: true })).steps) {
    assert.equal(step.earned, step.state === 'earned', `${step.id}: earned and state agree`);
  }
});

test('a live answer counts only while no scheduled check exists, and the wording follows', () => {
  // Stockroom: answered the page's live check, never swept.
  const unswept = deriveMaturity(facts({ liveAnswered: true }));
  assert.equal(unswept.current, 'answers');
  assert.match(unswept.steps[0].detail, /live check when this page loaded; no scheduled checks yet/);

  // Never checked at all is not "has not answered".
  assert.equal(deriveMaturity(facts()).summary, 'Listed in the registry; Pokter has not checked it yet.');

  // A history of failures is not overturned by one live answer.
  const failing = deriveMaturity(facts({ liveAnswered: true, probeRate: 0 }));
  assert.equal(failing.current, null);
  assert.equal(failing.summary, 'Listed in the registry; it has not answered Pokter’s checks.');
});

test('deliveries funded only by Pokter’s team say so', () => {
  const teamOnly = deriveMaturity(facts({ reachable: true, compatible: true, hired: true, delivered: true }));
  assert.equal(teamOnly.label, 'Delivered (team hires)');
  /*
   * The chip on a catalogue card has no room for the qualifier, so it
   * carries `badge` and says the rest on its own line. The published
   * `label` keeps it: the agent page title, the v1 API's
   * `evidence.label` and the MCP server all read that one, and dropping
   * it there would quietly lose the distinction for machines.
   */
  assert.equal(teamOnly.badge, 'Delivered', 'the chip drops the qualifier');
  assert.notEqual(teamOnly.label, teamOnly.badge, 'label differs from badge exactly when the qualifier applies');
  assert.match(teamOnly.steps.find((s) => s.id === 'delivered')!.detail, /funded by Pokter’s team/);

  const outside = deriveMaturity(facts({ reachable: true, compatible: true, hired: true, delivered: true, outsideTeam: { jobs: 1, completed: 1, terminal: 1, uniqueBuyers: 1, completionRate: 1 } }));
  assert.equal(outside.label, 'Delivered');
});
