import assert from 'node:assert/strict';
import test from 'node:test';

import { declaredCapabilities } from '../src/lib/agents/capabilities';

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
