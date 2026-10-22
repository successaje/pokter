import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { subjectFromBrief, subjectKeyForSkill } from '../src/lib/erc8183/brief-subject';
import { parseAgentRef, EVIDENCE_CHAINS } from '../src/lib/evidence/refs';

const f = JSON.parse(readFileSync('tests/fixtures/job-1585.json', 'utf8')) as { description: string };
const task = (JSON.parse(f.description) as { task: string }).task;

test('job 1585 names its subject explicitly, and it is read not inferred', () => {
  /*
   * The signed brief says "Report on agent 97/2618 (Brinkwatch on BNB
   * Testnet)". Reading that is parsing; the refusals below are what keep it
   * from becoming a guess.
   */
  assert.match(task, /agent 97\/2618/);
  const subject = subjectFromBrief(task);
  assert.equal(subject.ok, true, subject.ok ? '' : `refused: ${subject.code}`);
  if (!subject.ok) return;
  assert.equal(subject.agent, '97/2618');
  assert.equal(subject.chainId, 97);
  assert.equal(subject.tokenId, '2618');
});

test('what Pokter sends is a form the skill published', () => {
  /*
   * The card's contract: examples ["56/303779", "eip155:97:2554"], read from
   * `data.agent`. Testing against the agent's own parser rather than against
   * a copy of its rules means what Pokter extracts and what the agent
   * accepts cannot drift apart.
   */
  const subject = subjectFromBrief(task);
  assert.equal(subject.ok, true);
  if (!subject.ok) return;

  const asAgentReads = parseAgentRef(subject.agent, EVIDENCE_CHAINS[0]);
  assert.deepEqual(asAgentReads, { chainId: 97, tokenId: '2618' }, 'the agent parses what we send');

  // And the published examples parse the same way, so the shape matches.
  for (const example of ['56/303779', 'eip155:97:2554']) {
    assert.notEqual(parseAgentRef(example, EVIDENCE_CHAINS[0]), null, `${example} is a valid reference`);
  }
  assert.match(subject.agent, /^\d+\/\d+$/, 'the same shape as the first example');
});

test('two different subjects are refused, never chosen between', () => {
  const two = 'Compare agent 97/2618 with agent 97/2599 and report on both.';
  const subject = subjectFromBrief(two);
  assert.equal(subject.ok, false);
  if (!subject.ok) {
    assert.equal(subject.code, 'ambiguous');
    assert.deepEqual(subject.candidates.sort(), ['97/2599', '97/2618']);
  }
});

test('the same subject named twice is not ambiguous', () => {
  const twice = 'Report on 97/2618. Everything about 97/2618 and nothing else.';
  const subject = subjectFromBrief(twice);
  assert.equal(subject.ok, true);
  if (subject.ok) assert.equal(subject.agent, '97/2618');
});

test('a brief naming no subject is refused', () => {
  for (const text of [
    'Analyse the requested onchain objective',
    'Report on the lending-risk agent we discussed.',
    '',
  ]) {
    const subject = subjectFromBrief(text);
    assert.equal(subject.ok, false, `"${text.slice(0, 30)}" must be refused`);
    if (!subject.ok) assert.equal(subject.code, 'none');
  }
});

test('a bare number is not treated as a token id', () => {
  /*
   * `2618` alone could be a budget, a count or a block height. The card does
   * offer a bare form; Pokter does not use it, because accepting one would
   * be the inference this exists to avoid.
   */
  const subject = subjectFromBrief('Report on agent 2618 please.');
  assert.equal(subject.ok, false);
  if (!subject.ok) assert.equal(subject.code, 'none');
});

test('dates, times and ratios do not become agent references', () => {
  /*
   * They would parse as chain/token pairs but name chains the skill does not
   * serve, and `parseAgentRef` drops those rather than retargeting them —
   * which is why it is reused here instead of a second parser.
   */
  for (const text of [
    'Due 22/10 and reviewed at 11:18 with a 3/4 majority.',
    'Compare the 1/2 and 2/3 splits.',
  ]) {
    const subject = subjectFromBrief(text);
    assert.equal(subject.ok, false, `"${text}" must name no agent`);
    if (!subject.ok) assert.equal(subject.code, 'none');
  }
});

test('a chain the skill does not serve is dropped, not retargeted', () => {
  // Answering about chain 97 when the brief asked about chain 1 would be a
  // confident report on the wrong agent.
  const subject = subjectFromBrief('Report on agent 1/2618 on Ethereum.');
  assert.equal(subject.ok, false);
  if (!subject.ok) assert.equal(subject.code, 'none');
});

test('only skills that publish a subject input get one', () => {
  assert.equal(subjectKeyForSkill('agent_evidence'), 'agent');
  assert.equal(subjectKeyForSkill('negotiate'), null);
  assert.equal(subjectKeyForSkill('some_other_skill'), null, 'no key is invented for an undescribed skill');
});

test('the eip155 form is accepted as the card describes it', () => {
  const subject = subjectFromBrief('Report on eip155:97:2554 for me.');
  assert.equal(subject.ok, true);
  if (subject.ok) assert.equal(subject.agent, '97/2554');
});
