import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import { declaredCapabilities, examplesInDescription } from '../src/lib/agents/capabilities';

/*
 * Shapes taken from real cards in the catalogue, including the plumbing that
 * every ERC-8183 seller publishes and that would otherwise crowd out the
 * capabilities — on some agents it is all there is.
 */
test('protocol plumbing is not a capability', () => {
  const skills = [
    { id: 'negotiate', name: 'Negotiate an ERC-8183 job' },
    { id: 'negotiate', name: 'ERC-8183 quote' },
    { id: 'negotiate-erc8183-job', name: 'Negotiate an ERC-8183 job' },
    { id: 'erc8183-job-status', name: 'ERC-8183 job status' },
    { id: 'notify_funded', name: 'Job funded' },
    { id: 'health-factor-read', name: 'Read a Venus health factor' },
  ];

  assert.deepEqual(
    declaredCapabilities(skills).map((s) => s.name),
    ['Read a Venus health factor'],
  );
});

test('an agent publishing only plumbing declares nothing', () => {
  const skills = [
    { id: 'negotiate', name: 'Negotiate an ERC-8183 job' },
    { id: 'notify_funded', name: 'Notify the seller a job is funded' },
  ];
  assert.deepEqual(declaredCapabilities(skills), []);
});

test('nameless and duplicate skills are dropped', () => {
  const skills = [
    { id: 'a', name: '' },
    { id: 'b' },
    { id: 'trade', name: 'On-chain trading' },
    { id: 'trade-2', name: 'on-chain trading' },
  ];
  assert.deepEqual(
    declaredCapabilities(skills).map((s) => s.name),
    ['On-chain trading'],
  );
});

test('the list is capped and keeps declaration order', () => {
  const skills = Array.from({ length: 9 }, (_, i) => ({
    id: `s${i}`,
    name: `Skill ${i}`,
  }));
  assert.deepEqual(
    declaredCapabilities(skills, 3).map((s) => s.name),
    ['Skill 0', 'Skill 1', 'Skill 2'],
  );
});

test('a malformed card is not a crash', () => {
  assert.deepEqual(declaredCapabilities(undefined), []);
  assert.deepEqual(declaredCapabilities(null), []);
  assert.deepEqual(declaredCapabilities('skills'), []);
  assert.deepEqual(declaredCapabilities([null, 7, 'x']), []);
});

/*
 * Two live cards as published on 15 October 2026. Stockroom documents its
 * brief only inside its negotiate skill; IVL's negotiate skill is generic
 * and its brief format sits on a free preview skill.
 */
const stockroom = JSON.parse(readFileSync(new URL('./fixtures/card-stockroom.json', import.meta.url), 'utf8'));
const ivl = JSON.parse(readFileSync(new URL('./fixtures/card-ivl.json', import.meta.url), 'utf8'));

test('a negotiate skill named after the work is kept as the paid job, with its example', () => {
  const skills = declaredCapabilities(stockroom.skills);
  assert.equal(skills.length, 1);
  assert.equal(skills[0].kind, 'paid');
  assert.equal(skills[0].name, 'Quote a Stockroom borrow desk brief');
  assert.deepEqual(skills[0].examples, ['Desk brief for shorting 0.01 NVDAB against 10 USDT over the weekend']);
  // What it is for, without the wire instructions.
  assert.match(skills[0].description ?? '', /^Ask the Stockroom Desk Analyst for a borrow desk brief/);
  assert.doesNotMatch(skills[0].description ?? '', /Send a data part/);
});

test('a free preview is kept apart from the paid job, and a placeholder is not an example', () => {
  const skills = declaredCapabilities(ivl.skills);
  assert.deepEqual(skills.map((s) => [s.name, s.kind]), [['Preview the rebalance plan (free)', 'preview']]);
  assert.deepEqual(skills[0].examples, ['BNB-USDT 0xYourWallet']);
  assert.deepEqual(examplesInDescription('{"skill": "negotiate", "task_description": "...", "terms": {}}'), []);
});

test('the preview’s description keeps what it needs and drops the payload', () => {
  const [preview] = declaredCapabilities(ivl.skills);
  assert.doesNotMatch(preview.description ?? '', /\{/);
  assert.match(preview.description ?? '', /Omit the wallet to get the pair-level reading only/);
});
