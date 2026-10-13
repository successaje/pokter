import assert from 'node:assert/strict';
import test from 'node:test';

import { commissionTaskTemplates, templatesFromSkills } from '../src/lib/hire/taskTemplates';

/*
 * Which task a buyer is offered.
 *
 * Templates were chosen by category, which assumes every agent is one of
 * five kinds of DeFi assistant. Pokter's own evidence agent carries no
 * category, so it was hired on mainnet — job 56981, real $U — with
 * "Analyse the requested onchain objective", a brief it had to refuse,
 * while its card published the two formats that would have worked.
 */

const EVIDENCE_SKILLS = [
  { name: 'Quote a price for an evidence report', examples: [] },
  { name: 'Evidence for an ERC-8004 agent', examples: ['56/303779', 'eip155:97:2554'] },
];

test('an agent that documents how to ask it is asked that way', () => {
  const templates = templatesFromSkills(EVIDENCE_SKILLS);
  assert.deepEqual(templates.map((t) => t.task), ['56/303779', 'eip155:97:2554']);
  assert.match(templates[0].description, /this agent's own card/);
  assert.match(templates[0].description, /Evidence for an ERC-8004 agent/);
});

test('a card that says nothing leaves the category templates alone', () => {
  assert.deepEqual(templatesFromSkills([]), []);
  assert.deepEqual(templatesFromSkills([{ name: 'Something', examples: [] }]), []);
  /* The caller falls back to these, unchanged. */
  assert.equal(commissionTaskTemplates('yield').length, 3);
});

test('nothing is invented from a card', () => {
  /* Every task offered is a string the agent itself published. */
  const published = new Set(EVIDENCE_SKILLS.flatMap((s) => s.examples));
  for (const t of templatesFromSkills(EVIDENCE_SKILLS)) assert.ok(published.has(t.task));
});

test('labels stay short enough for the control that renders them', () => {
  const long = 'x'.repeat(120);
  const [t] = templatesFromSkills([{ name: 'S', examples: [long] }]);
  assert.ok(t.label.length <= 28, t.label.length.toString());
  assert.ok(t.short.length <= 14, t.short.length.toString());
  /* The task itself is never truncated — only its label. */
  assert.equal(t.task, long);
});

test('duplicates and empties are dropped, and the list is capped', () => {
  const templates = templatesFromSkills([
    { name: 'A', examples: ['one', 'one', '  ', 'two'] },
    { name: 'B', examples: ['three', 'four', 'five'] },
  ]);
  assert.deepEqual(templates.map((t) => t.task), ['one', 'two', 'three']);
});

test('ids stay distinct, since the control selects by id', () => {
  const ids = templatesFromSkills([{ name: 'A', examples: ['a', 'b', 'c'] }]).map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

/*
 * Whether a brief is long enough to fund escrow with.
 *
 * The ten-character floor stops somebody funding a job with "hi". It
 * also blocked "56/303779" — nine characters, and the exact string the
 * evidence agent's card publishes as how to ask it, which Pokter had
 * just started offering as a suggestion. The buyer could select it and
 * then could not continue.
 */
const ready = (task: string, templates: { task: string }[]) =>
  task.trim().length >= 10 || templates.some((t) => t.task === task.trim());

test('a declared example is accepted however short it is', () => {
  const templates = templatesFromSkills([
    { name: 'Evidence for an ERC-8004 agent', examples: ['56/303779', 'eip155:97:2554'] },
  ]);
  assert.equal(ready('56/303779', templates), true, 'nine characters, and the agent asked for it');
  assert.equal(ready('eip155:97:2554', templates), true);
});

test('free text still has to say something', () => {
  const templates = templatesFromSkills([{ name: 'S', examples: ['56/303779'] }]);
  assert.equal(ready('hi', templates), false);
  assert.equal(ready('   ', templates), false);
  /* Short, and not something any agent published. */
  assert.equal(ready('56/999999', templates), false);
});

test('a long brief needs no template at all', () => {
  assert.equal(ready('Analyse the lending position and report the risks.', []), true);
});
