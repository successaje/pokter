import assert from 'node:assert/strict';
import test from 'node:test';

import { publicErrorMessage } from '../src/lib/api/public-error';

test('a reason a buyer can act on survives unchanged', () => {
  assert.equal(publicErrorMessage(new Error('The agent answered HTTP 500.')), 'The agent answered HTTP 500.');
  assert.equal(publicErrorMessage(new Error('The seller did not answer within 50 seconds.')), 'The seller did not answer within 50 seconds.');
});

test("viem's detail lines and request body do not reach the caller", () => {
  const error = Object.assign(
    new Error('HTTP request failed.\n\nURL: https://bsc.rpc.example/v1/abc?apikey=s3cr3t\nRequest body: {"method":"eth_call"}\n\nVersion: viem@2.21.0'),
    { shortMessage: 'HTTP request failed.' },
  );
  assert.equal(publicErrorMessage(error), 'HTTP request failed.');
  // Without shortMessage, only the first line is kept.
  assert.equal(publicErrorMessage(new Error('Execution reverted.\nRequest body: {"x":1}')), 'Execution reverted.');
});

test('query strings, private hosts, secret names and commands are removed', () => {
  assert.equal(publicErrorMessage(new Error('fetch https://rpc.example/path?key=abc failed')), 'fetch https://rpc.example/path failed');
  assert.equal(publicErrorMessage(new Error('could not reach https://0.0.0.0:8080/api/x')), 'could not reach [internal address]');
  assert.equal(publicErrorMessage(new Error('Escrow is not configured: set ALTANA_ADMIN_KEY with fly secrets set ALTANA_ADMIN_KEY=0x…')), 'Escrow is not configured: set [configuration] with [configuration command]');
});

test('an empty or unknown failure falls back, and a long one is capped', () => {
  assert.equal(publicErrorMessage(undefined, 'Could not read the job.'), 'Could not read the job.');
  assert.equal(publicErrorMessage(new Error(''), 'Fallback.'), 'Fallback.');
  const long = publicErrorMessage(new Error('x'.repeat(500)));
  assert.ok(long.length <= 240 && long.endsWith('…'));
});
