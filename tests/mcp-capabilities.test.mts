import assert from 'node:assert/strict';
import test from 'node:test';

import { declaredCapabilities, mcpCapabilities } from '../src/lib/agents/capabilities';

/*
 * The nine tools 4LPHA's Grid agent actually serves, as `tools/list`
 * returned them. Its page said "No skills declared on its card" while
 * Pokter's own prober had read these and the API was publishing them.
 */
const FOURLPHA = [
  { name: 'explain_strategy', description: 'Explain how a 4lpha Grid, LP or Trading strategy works, its main settings, risks and custody boundary.' },
  { name: 'list_agents', description: 'List the 4lpha agents.' },
  { name: 'get_hire_link', description: 'Return the deploy link a human opens to hire one 4lpha agent.' },
  { name: 'agent_status', description: null },
  { name: 'bstock_analysis', description: 'Analyse a bStock.' },
];

test('an MCP tool list becomes skills the page can show', () => {
  const skills = mcpCapabilities(FOURLPHA);
  assert.ok(skills.length > 0, 'a nine-tool agent must not read as claiming nothing');
  assert.equal(skills[0].name, 'explain_strategy');
  assert.match(String(skills[0].description), /Explain how a 4lpha Grid/);
});

test('every MCP tool is a capability, never a guess at the paid job', () => {
  /*
   * `paid` and `preview` come from an A2A card's id and tags taxonomy.
   * MCP has no equivalent, and naming one the paid job from its name
   * would put an unchecked claim on the page.
   */
  for (const skill of mcpCapabilities([...FOURLPHA, { name: 'desk_quote', description: 'A wallet-signed price quote.' }], 10)) {
    assert.equal(skill.kind, 'capability');
  }
});

test('job plumbing is dropped, by the same rule the card path uses', () => {
  const skills = mcpCapabilities(
    [{ name: 'notify_funded', description: 'Job funded callback.' }, { name: 'negotiate', description: 'Negotiate an ERC-8183 job.' }, { name: 'getSupplyAPR', description: 'Supply APR.' }],
    10,
  );
  assert.deepEqual(skills.map((s) => s.name), ['getSupplyAPR'], 'only the real capability survives');
});

test('an agent whose tools are all plumbing claims nothing, rather than claiming plumbing', () => {
  assert.deepEqual(mcpCapabilities([{ name: 'notify-funded', description: null }]), []);
});

test('examples stay empty, so no brief is built from a JSON Schema', () => {
  // `templatesFromSkills` offers a buyer a skill's examples as a brief. An
  // input schema says what arguments are accepted, not how to ask.
  for (const skill of mcpCapabilities(FOURLPHA, 10)) assert.deepEqual(skill.examples, []);
});

test('duplicate and nameless tools are dropped', () => {
  const skills = mcpCapabilities(
    [{ name: 'a', description: null }, { name: 'A', description: 'dupe by case' }, { name: '', description: 'nameless' }, { name: 'b', description: null }],
    10,
  );
  assert.deepEqual(skills.map((s) => s.name), ['a', 'b']);
});

test('the limit holds, so one card cannot be filled by a 22-tool agent', () => {
  const many = Array.from({ length: 22 }, (_, i) => ({ name: `tool_${i}`, description: null }));
  assert.equal(mcpCapabilities(many).length, 4);
  assert.equal(mcpCapabilities(many, 12).length, 12);
});

test('junk in is nothing out, never a throw', () => {
  for (const input of [null, undefined, 'tools', 42, {}, [null], [{}], [{ description: 'no name' }]]) {
    assert.deepEqual(mcpCapabilities(input as unknown), []);
  }
});

test('the A2A path is untouched by any of this', () => {
  // The card taxonomy still produces paid/preview kinds as before.
  const fromCard = declaredCapabilities([
    { id: 'health-check', name: 'Health factor check', description: 'Reads a position.', examples: ['Check 0xabc'] },
  ]);
  assert.equal(fromCard.length, 1);
  assert.equal(fromCard[0].kind, 'capability');
  assert.deepEqual(fromCard[0].examples, ['Check 0xabc'], 'card examples still carried through');
});
