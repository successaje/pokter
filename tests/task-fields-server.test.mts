import assert from 'node:assert/strict';
import test from 'node:test';

import { declaredTaskProblems } from '../src/lib/hire/task-fields';

const GRID = '{"skill":"grid_plan","pair":"BNB/USDT","levels":10,"wallet":"0x0000000000000000000000000000000000000000"}';
const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

test('prose is the agent’s to judge and passes', () => {
  assert.deepEqual(declaredTaskProblems('Where should 1000 USDT earn the most?', [GRID]), []);
});

test('raw JSON cannot skip the declared types or required keys', () => {
  const problems = declaredTaskProblems(JSON.stringify({ skill: 'grid_plan', pair: 'BNB/USDT', levels: 'eight' }), [GRID]);
  assert.ok(problems.includes('levels must be a number'));
  assert.ok(problems.includes('wallet is required'));
});

test('routing values must be the declared ones', () => {
  const problems = declaredTaskProblems(JSON.stringify({ skill: 'withdraw_all', pair: 'BNB/USDT', levels: 8, wallet: WALLET }), [GRID]);
  assert.deepEqual(problems, ['skill must be "grid_plan", as the agent declares']);
});

test('a complete task passes, and broken JSON is named', () => {
  assert.deepEqual(declaredTaskProblems(JSON.stringify({ skill: 'grid_plan', pair: 'BNB/USDT', levels: 8, wallet: WALLET }), [GRID]), []);
  assert.deepEqual(declaredTaskProblems('{"skill": "grid_plan",', [GRID]), ['The task starts like JSON but is not valid JSON']);
  assert.deepEqual(declaredTaskProblems('[1,2]', [GRID]), ['A JSON task must be an object']);
});

test('without declared JSON, the task’s own placeholders still count', () => {
  assert.deepEqual(declaredTaskProblems('{"token":"0x0000000000000000000000000000000000000000"}', []), ['token is required']);
});
