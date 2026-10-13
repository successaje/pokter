import assert from 'node:assert/strict';
import test from 'node:test';

import { NO_ENDPOINT, probeX402, readX402Response } from '../src/lib/x402/probe';

/*
 * What Pokter may say about an agent that claims x402.
 *
 * `x402Support: true` is a bare boolean in the ERC-8004 registration file,
 * carried by 79,907 mainnet agents, with no field anywhere in the schema
 * saying where to pay. Pokter forwarded that flag to buyers as a
 * capability. These pin the readings it is allowed to make instead.
 */

test('a real challenge is the only thing called payable', () => {
  const r = readX402Response(402, { accepts: [{ scheme: 'exact', network: 'eip155:56' }] });
  assert.equal(r.observation, 'demands-payment');
  assert.equal(r.options, 1);
});

test('a 402 with no terms is not a payment demand', () => {
  /* Nothing in it a payer could act on, so it is reported as malformed
     rather than counted as working x402. */
  for (const body of [null, {}, { accepts: [] }, { accepts: 'soon' }]) {
    const r = readX402Response(402, body);
    assert.equal(r.observation, 'malformed-challenge', JSON.stringify(body));
    assert.equal(r.options, 0);
  }
});

test('answering 200 is reported as not asking to be paid', () => {
  const r = readX402Response(200, null);
  assert.equal(r.observation, 'no-payment-demanded');
  assert.match(r.detail, /did not ask to be paid/);
});

test('no endpoint says the claim has no address, not that the agent failed', () => {
  assert.equal(NO_ENDPOINT.observation, 'no-endpoint');
  assert.match(NO_ENDPOINT.detail, /no endpoint that takes payment/);
  assert.ok(!/failed|broken/i.test(NO_ENDPOINT.detail));
});

test('an endpoint Pokter cannot reach is our gap, not their finding', async () => {
  const r = await probeX402('https://example.invalid/pay', async () => {
    throw Object.assign(new Error('nope'), { name: 'TimeoutError' });
  });
  assert.equal(r.observation, 'unreachable');
  assert.match(r.detail, /gap in our measurement, not a finding about the agent/);
});

test('a non-https or absent endpoint is never dialled', async () => {
  let called = false;
  const spy = (async () => { called = true; return new Response(); }) as unknown as typeof fetch;
  for (const endpoint of [null, '', 'http://insecure.example/pay', 'ftp://x']) {
    assert.equal((await probeX402(endpoint, spy)).observation, 'no-endpoint');
  }
  assert.equal(called, false);
});

test('the probe never pays: it only ever issues a GET', async () => {
  const seen: string[] = [];
  const spy = (async (_u: string, init?: RequestInit) => {
    seen.push(init?.method ?? 'GET');
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  await probeX402('https://agent.example/paid', spy);
  assert.deepEqual(seen, ['GET']);
});
