import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILD_STYLES, blockingQuestions, buildStyle, hasIdea, routineDecisions, suppliedFields } from '../src/lib/builder/style';
import { CONCEPTS, RECOMMENDED_CONCEPT_ID, applyConcept, conceptById } from '../src/lib/builder/concepts';
import { CATEGORIES } from '../src/lib/agents/categories';
import type { DraftFields } from '../src/lib/builder/drafts';

const EMPTY: DraftFields = { name: '', description: '', category: '', protocol: 'a2a', endpoint: '', image: '', repository: '' };

test('both styles exist, and recommend-and-build is the default', () => {
  assert.deepEqual(BUILD_STYLES.map((style) => style.id), ['recommend', 'with-me']);
  assert.equal(buildStyle('recommend').id, 'recommend');
  // An unknown id must not blank the switch.
  assert.equal(buildStyle('nonsense' as 'recommend').id, 'recommend');
});

test('nothing already supplied is asked for again', () => {
  assert.deepEqual(suppliedFields(EMPTY), []);
  const partly = { ...EMPTY, name: 'Token Screen', category: 'token-safety' };
  assert.deepEqual(suppliedFields(partly), ['name', 'category']);
  assert.equal(hasIdea(partly), true);
  assert.equal(hasIdea(EMPTY), false);
  assert.equal(
    blockingQuestions(partly).some((question) => question.id === 'category'),
    false,
    'a category already chosen must not be asked for',
  );
});

test('blocking questions are few, grouped, and only the ones Pokter cannot decide', () => {
  const questions = blockingQuestions(EMPTY);
  assert.deepEqual(questions.map((question) => question.id), ['category', 'endpoint', 'network']);
  assert.ok(questions.length <= 3, 'three at most, so they can arrive in one message');
  for (const question of questions) assert.ok(question.because.length > 20, `${question.id} must say why it cannot be decided`);
  const complete = { ...EMPTY, category: 'yield', endpoint: 'https://agent.example.com' };
  assert.deepEqual(blockingQuestions(complete).map((question) => question.id), ['network']);
});

test('routine decisions are taken and shown with a reason', () => {
  const decisions = routineDecisions(EMPTY);
  assert.ok(decisions.length >= 3);
  for (const decision of decisions) assert.ok(decision.because.length > 20, `${decision.id} must justify itself`);
  assert.match(routineDecisions({ ...EMPTY, protocol: 'mcp' }).find((d) => d.id === 'protocol')!.decision, /MCP/);
});

test('every concept names the customer, the inputs, the output, the limit and why anyone would pay', () => {
  assert.ok(CONCEPTS.length >= 3 && CONCEPTS.length <= 5, 'three to five, not a catalogue');
  const categories = new Set<string>();
  const customers = new Set<string>();
  for (const concept of CONCEPTS) {
    assert.ok(concept.customer.length > 30, `${concept.id} customer`);
    assert.ok(concept.inputs.length > 0, `${concept.id} inputs`);
    assert.ok(concept.output.length > 30, `${concept.id} output`);
    assert.ok(concept.limitation.length > 30, `${concept.id} limitation`);
    assert.ok(concept.whyHire.length > 30, `${concept.id} whyHire`);
    assert.ok(concept.nameSuggestions.length >= 2, `${concept.id} should offer names without demanding one`);
    const length = concept.description.trim().length;
    assert.ok(length >= 40 && length <= 600, `${concept.id} description must satisfy the form's own limits, got ${length}`);
    assert.ok(CATEGORIES.some((category) => category.id === concept.category), `${concept.id} category must be a real one`);
    categories.add(concept.category);
    customers.add(concept.customer);
  }
  assert.equal(categories.size, CONCEPTS.length, 'genuinely different, not five flavours of one');
  assert.equal(customers.size, CONCEPTS.length);
});

/*
 * Pokter grants no agent authority over a buyer's wallet, so a concept
 * that promised to trade or move funds would be unbuildable here. A
 * suggestion the product cannot deliver is worse than no suggestion.
 */
test('no concept promises to act on the buyer behalf', () => {
  for (const concept of CONCEPTS) {
    const text = `${concept.task} ${concept.output} ${concept.description}`;
    assert.doesNotMatch(text, /\b(executes?|trades on|moves funds|rebalances for you|places orders)\b/i, concept.id);
  }
});

test('one concept is recommended and the argument for it is plain', () => {
  const recommended = conceptById(RECOMMENDED_CONCEPT_ID);
  assert.ok(recommended, 'the recommendation must point at a concept that exists');
});

test('accepting a concept fills only the blanks', () => {
  const concept = conceptById(RECOMMENDED_CONCEPT_ID)!;
  const fresh = applyConcept(concept, EMPTY);
  assert.equal(fresh.name, concept.nameSuggestions[0]);
  assert.equal(fresh.category, concept.category);
  const mine = applyConcept(concept, { ...EMPTY, name: 'My Own Name', description: 'x'.repeat(50) });
  assert.equal(mine.name, 'My Own Name', 'a name already given is never replaced');
  assert.equal(mine.description, 'x'.repeat(50));
});
