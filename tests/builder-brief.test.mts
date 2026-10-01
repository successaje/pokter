import assert from 'node:assert/strict';
import test from 'node:test';

import { draftFromBrief } from '../src/lib/builder/brief';

const base = {
  outcome: 'yield',
  audience: ' BNB Chain treasury teams ',
  task: 'compare supported stablecoin positions.',
  evidence: 'sources, assumptions and timestamps',
  limits: 'move funds or guarantee returns',
  interaction: 'task' as const,
};

test('a task brief becomes an editable A2A marketplace draft', () => {
  assert.deepEqual(draftFromBrief(base), {
    name: 'Yield Researcher',
    description: 'Compare supported stablecoin positions for BNB Chain treasury teams. The result includes sources, assumptions and timestamps. It does not move funds or guarantee returns.',
    category: 'yield',
    protocol: 'a2a',
  });
});

test('a callable-tool brief recommends MCP without inventing endpoint data', () => {
  const draft = draftFromBrief({ ...base, interaction: 'tool' });
  assert.equal(draft.protocol, 'mcp');
  assert.deepEqual(Object.keys(draft).sort(), ['category', 'description', 'name', 'protocol']);
});

test('generated public copy stays inside the registration description limit', () => {
  const draft = draftFromBrief({
    ...base,
    task: 'a'.repeat(180),
    audience: 'b'.repeat(100),
    evidence: 'c'.repeat(160),
    limits: 'd'.repeat(160),
  });
  assert.equal(draft.description.length, 600);
});
