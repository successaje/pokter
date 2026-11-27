import assert from 'node:assert/strict';
import test from 'node:test';

import { agentNameIn, asksForAgents, looksLikeName, nameMatches } from '../src/lib/scout/web-routing';

/*
 * When Scout on the website looks an agent up, and when it searches.
 * Each case below is a question a visitor asked, or one shaped like it.
 */

test('an agent asked about the way people ask is read as a name', () => {
  assert.equal(agentNameIn('Tell me more about BrinkWatch'), 'BrinkWatch');
  assert.equal(agentNameIn('tell me about brinkwatch'), 'brinkwatch');
  assert.equal(agentNameIn('What is YieldOracle?'), 'YieldOracle');
  assert.equal(agentNameIn('What does Hevo Yield do?'), 'Hevo Yield');
  assert.equal(agentNameIn('Is Brinkwatch by Pokter reliable?'), 'Brinkwatch by Pokter');
  assert.equal(agentNameIn('Can I trust the agent Ledger Lens?'), 'Ledger Lens');
  assert.equal(agentNameIn('Thoughts on “Touchstone”?'), 'Touchstone');
});

test('Pokter’s own words, kinds of things and references back are not names', () => {
  for (const question of [
    'Hi', 'How are you doing today?', 'Who are you?', 'What is Pokter?', 'What is escrow?',
    'What’s a signed price?', 'What is testnet', 'Tell me more about it', 'Tell me about the first one',
    'Explain this agent in simple terms', 'What does it do?', 'Tell me about yield agents',
    'What are the best trading bots', 'Tell me a joke', 'What does Replies reliably mean?',
    'Explain Brinkwatch by Pokter in simple terms: what it does, what Pokter’s checks show, and what hiring it would involve.',
  ]) {
    assert.equal(agentNameIn(question), null, question);
  }
});

test('asking which agents do a task is a search', () => {
  for (const question of [
    'What agents can I hire regarding Yield optimization',
    'Which agents check token safety?',
    'Any good trading bots?',
    'Tell me about yield agents',
    'I need a health factor agent',
    'Who can I hire for an audit?',
    'Are there agents for research?',
    'Find an agent to research tokens',
  ]) {
    assert.equal(asksForAgents(question), true, question);
  }
});

test('how-to questions, small talk and a builder’s own agent are not searches', () => {
  for (const question of [
    'Hi', 'How are you doing today?', 'How do I hire an agent?', 'Where do I hire it?',
    'Explain this agent in simple terms', 'How do I list my agent?', 'Is my agent listed?',
    'I want to register an agent', 'Can I chat with you?', 'Show me more', 'What is escrow?',
  ]) {
    assert.equal(asksForAgents(question), false, question);
  }
});

test('a name read from a question matches an agent only from the start of its name', () => {
  assert.equal(nameMatches('BrinkWatch', 'Brinkwatch by Pokter'), true);
  assert.equal(nameMatches('Brink Watch', 'Brinkwatch'), true);
  assert.equal(nameMatches('Hevo Yield', 'Hevo Yield'), true);
  assert.equal(nameMatches('Watch', 'Brinkwatch by Pokter'), false);
  assert.equal(nameMatches('escrow', 'Smart Escrow Guardian'), false);
  assert.equal(nameMatches('Brink', 'Brinkwatch by Pokter'), false, 'part of a word is not a name');
});

test('a capital or a digit is how a name is written', () => {
  assert.equal(looksLikeName('BrinkWatch'), true);
  assert.equal(looksLikeName('agent 007'), true);
  assert.equal(looksLikeName('yield farming'), false);
});
