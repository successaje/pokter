import assert from 'node:assert/strict';
import test from 'node:test';

import { sampleBrief } from '../src/lib/erc8183/sample-enquiry';
import { HOUSE_AGENTS } from '../src/lib/house/registry';

/*
 * The retry exists for agents that decline the generic enquiry because it
 * names nothing to price. A sample brief no agent in its category would
 * accept would only trade one refusal for another, so each is checked
 * against Pokter's own agent in that category, which refuses an
 * incomplete brief before quoting.
 */
test('every category sample is a brief its category accepts', () => {
  for (const agent of HOUSE_AGENTS) {
    const brief = sampleBrief(agent.category);
    assert.ok(brief, `${agent.slug}: a sample for ${agent.category}`);
    assert.equal(agent.check(brief), null, `${agent.slug} should accept: ${brief}`);
    assert.match(brief, /0x[0-9a-fA-F]{40}/, 'names a real address, not a placeholder');
  }
});

test('an unclassified agent is not asked a guessed question', () => {
  assert.equal(sampleBrief('unclassified'), null);
});
