import assert from 'node:assert/strict';
import test from 'node:test';

import { composeTask, fieldsWithValues, taskFields, taskProblems, withWallet } from '../src/lib/hire/task-fields';

const template = JSON.stringify({ skill: 'grid_plan', levels: 10, pair: 'BNB/USDT', options: { mode: 'geometric' } });

test('a number field keeps its type when text is typed into it, and stays an error', () => {
  // The review's reproduction: levels 10 edited to "eight".
  const schema = taskFields(template)!;
  const edited = composeTask(fieldsWithValues(schema, template)!.map((f) => (f.key === 'levels' ? { ...f, value: 'eight' } : f)));
  assert.equal(fieldsWithValues(schema, edited)!.find((f) => f.key === 'levels')!.kind, 'number');
  assert.deepEqual(taskProblems(schema, edited), ['levels must be a number']);
});

test('invalid nested JSON stays an error rather than becoming a string', () => {
  const schema = taskFields(template)!;
  const edited = composeTask(fieldsWithValues(schema, template)!.map((f) => (f.key === 'options' ? { ...f, value: '{mode: geometric' } : f)));
  assert.deepEqual(taskProblems(schema, edited), ['options must be valid JSON']);
});

test('raw JSON is held to the same rules: a removed key, or a broken object, blocks the hire', () => {
  const schema = taskFields(template)!;
  assert.deepEqual(taskProblems(schema, JSON.stringify({ skill: 'grid_plan', pair: 'BNB/USDT', options: {} })), []);
  const wallet = taskFields(JSON.stringify({ skill: 'health', wallet: '0x0000000000000000000000000000000000000000' }))!;
  assert.deepEqual(taskProblems(wallet, JSON.stringify({ skill: 'health' })), ['wallet is required']);
  assert.match(taskProblems(schema, '{ not json')[0], /must stay a JSON object/);
});

test('only a field declared as the buyer’s wallet is filled from the connected wallet', () => {
  const buyer = '0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90';
  const fields = taskFields(JSON.stringify({ wallet: '0x0000000000000000000000000000000000000000', token: '0x0000000000000000000000000000000000000000' }))!;
  const filled = withWallet(fields, buyer)!;
  assert.equal(filled.find((f) => f.key === 'wallet')!.value, buyer);
  // The token placeholder is not the buyer's wallet: left empty, and required.
  assert.equal(filled.find((f) => f.key === 'token')!.value, '');
  assert.equal(filled.find((f) => f.key === 'token')!.address, true);
  assert.deepEqual(taskProblems(fields, composeTask(filled)), ['token is required']);
  // A zero address typed into it is not accepted as an answer.
  assert.match(taskProblems(fields, JSON.stringify({ wallet: buyer, token: '0x0000000000000000000000000000000000000000' }))[0], /token needs a real address/);
});
