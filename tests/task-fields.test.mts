import assert from 'node:assert/strict';
import test from 'node:test';

import { composeTask, taskFieldProblems, taskFields, withWallet } from '../src/lib/hire/task-fields';

// The real example a health-factor agent publishes on its card.
const EXAMPLE = '{"skill":"health_factor","wallet":"0x0000000000000000000000000000000000000000"}';
const ME = '0x3fb8779f4f42e1800F27AAec9564530BCaa852Bf';

test('a declared JSON example becomes fields; the zero address is an empty required wallet', () => {
  const fields = taskFields(EXAMPLE)!;
  assert.deepEqual(fields.map((f) => [f.key, f.kind, f.value, f.wallet, f.fixed, f.required]), [
    ['skill', 'text', 'health_factor', false, true, false],
    ['wallet', 'text', '', true, false, true],
  ]);
  assert.deepEqual(taskFieldProblems(fields), ['wallet is required']);
});

test('the connected wallet fills the empty wallet field and the JSON keeps its shape', () => {
  const filled = withWallet(taskFields(EXAMPLE)!, ME)!;
  assert.deepEqual(taskFieldProblems(filled), []);
  assert.equal(composeTask(filled), `{"skill":"health_factor","wallet":"${ME}"}`);
  assert.equal(withWallet(filled, ME), null);
});

test('numbers, booleans and nested values keep their types', () => {
  const fields = taskFields('{"levels":10,"bandPct":8,"dryRun":true,"prices":{"ETH":2000}}')!;
  assert.deepEqual(fields.map((f) => f.kind), ['number', 'number', 'boolean', 'json']);
  const edited = fields.map((f) => (f.key === 'levels' ? { ...f, value: '12' } : f));
  assert.equal(composeTask(edited), '{"levels":12,"bandPct":8,"dryRun":true,"prices":{"ETH":2000}}');
  assert.deepEqual(taskFieldProblems(edited.map((f) => (f.key === 'bandPct' ? { ...f, value: 'eight' } : f))), ['bandPct must be a number']);
});

test('prose, arrays and invalid JSON stay a text task', () => {
  assert.equal(taskFields('Analyse my Venus lending position.'), null);
  assert.equal(taskFields('[1,2]'), null);
  assert.equal(taskFields('{"oops":'), null);
});

test('a wallet field with something that is not an address is flagged', () => {
  const fields = taskFields(EXAMPLE)!.map((f) => (f.key === 'wallet' ? { ...f, value: 'me' } : f));
  assert.deepEqual(taskFieldProblems(fields), ['wallet must be a 0x address']);
});
