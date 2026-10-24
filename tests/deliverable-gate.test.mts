import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { keccak256, sha256, stringToBytes } from 'viem';

import { deliverableGate } from '../src/lib/erc8183/deliverable-gate';

const text = JSON.stringify({ job_id: 1, answer: 'done' });
const prepared = { manifestText: text, submitTxHash: null };
const chainSays = (value: unknown) => async () => value;

test('prepared but not submitted is not served', async () => {
  assert.deepEqual(await deliverableGate(prepared, chainSays('0x' + '0'.repeat(64))), { serve: false, status: 404, reason: 'Not delivered yet: nothing submitted on chain for this job matches this deliverable.' });
  assert.equal((await deliverableGate(prepared, chainSays(undefined))).serve, false);
});

test('the chain committing to other bytes is not a delivery of these', async () => {
  assert.equal((await deliverableGate(prepared, chainSays(keccak256(stringToBytes('other'))))).serve, false);
});

test('the chain committing to these bytes is, in any form Pokter accepts, even unconfirmed', async () => {
  assert.deepEqual(await deliverableGate(prepared, chainSays(keccak256(stringToBytes(text)))), { serve: true, readChain: true });
  assert.deepEqual(await deliverableGate(prepared, chainSays(sha256(stringToBytes(text)))), { serve: true, readChain: true }, 'a captured SHA-256 delivery');
});

test('an unreadable chain is a 503, not a delivery and not "not delivered"', async () => {
  const gate = await deliverableGate(prepared, async () => {
    throw new Error('rpc down');
  });
  assert.equal(gate.serve, false);
  assert.equal(!gate.serve && gate.status, 503);
});

test('a recorded submit transaction is served without reading the chain', async () => {
  const gate = await deliverableGate({ manifestText: text, submitTxHash: '0x' + '1'.repeat(64) }, async () => {
    throw new Error('must not be read');
  });
  assert.deepEqual(gate, { serve: true, readChain: false });
});

test('the public route gates before it serves, and never caches a refusal', () => {
  const route = readFileSync(new URL('../src/app/api/seller/deliverables/[jobId]/route.ts', import.meta.url), 'utf8');
  /* Asserted on source: the route imports the ESM-only SDK, which this runner cannot load. */
  assert.ok(route.indexOf('deliverableGate(') > 0 && route.indexOf('deliverableGate(') < route.indexOf('new NextResponse(deliverable.manifestText'));
  assert.match(route, /status: gate\.status, headers: \{ 'Cache-Control': 'no-store'/);
});
