import assert from 'node:assert/strict';
import test from 'node:test';

import { isConversationQuestion, isMoreAgentsFollowUp, matchingNamedAgents, namedAgentQuery, shouldSearchAgents } from '../src/lib/telegram/scout-routing';

test('Scout treats the reported conversation turns as conversation, not searches', () => {
  for (const text of ['Can I hold a conversation with you?', 'Did you read my message?', "Aren't there others?"]) {
    assert.equal(shouldSearchAgents(text), false, text);
  }
  assert.equal(isConversationQuestion('Can I hold a conversation with you?'), true);
  assert.equal(isMoreAgentsFollowUp("Aren't there others?"), true);
});

test('named agents are extracted for verified name lookup', () => {
  assert.equal(namedAgentQuery('I hear there is one called Vice watch by Pokter'), 'Vice watch by Pokter');
  assert.equal(namedAgentQuery('Do you know about Vice Watch?'), 'Vice Watch');
  assert.equal(namedAgentQuery('Did you read my message?'), null);
});

test('named lookup discards unrelated semantic search hits', () => {
  const candidates = [{ name: 'JensenAI', tokenId: '364265' }, { name: 'Vice Watch by Pokter', tokenId: '2732' }];
  assert.deepEqual(matchingNamedAgents('Vice watch by Pokter', candidates), [candidates[1]]);
  assert.deepEqual(matchingNamedAgents('An unknown agent', candidates), []);
});

test('a task request still searches the catalogue', () => {
  assert.equal(shouldSearchAgents('Find an agent to research tokens'), true);
  assert.equal(shouldSearchAgents('I need to research some tokens before investing'), true);
  assert.equal(shouldSearchAgents('Can you recommend an agent for due diligence?'), true);
});
