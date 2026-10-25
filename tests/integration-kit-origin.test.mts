import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { originOf } from '../src/lib/api/origin';
import { buildIntegrationKit } from '../src/lib/integration/kit';

/*
 * The kit's self-links, and the origin they are built from.
 *
 * `/api/v1/integration` built its links from `new URL(request.url).origin`.
 * Behind Fly's proxy that is the socket the container listens on, so the
 * live document published every preflight tool on `https://0.0.0.0:8080`
 * — `/build/import`, `POST /api/compatibility` and the agent API.
 * Confirmed against production before this fix.
 *
 * It matters more than an ordinary broken link. The build prompt calls
 * this document the only authority and tells a builder to fetch it before
 * writing anything, and the first thing it offered was three tools on a
 * host nobody can reach. The page at `/build/integration` was right the
 * whole time because it takes the default origin, so the two halves of
 * what is meant to be one document disagreed, and the half written for
 * scripts and agents was the wrong one.
 *
 * `originOf` already existed for this exact failure elsewhere in the API
 * and carried no test of its own. It now lives in a module free of
 * `server-only` so it can have one. The route itself still cannot be
 * imported here — it reaches the escrow address table, and
 * `@altananetwork/sdk` publishes no entry point either test runner can
 * resolve — so its one line is asserted as a source fact, the pattern
 * `tests/provider-route-wiring.test.mts` uses.
 */

test('a forwarded host wins over the socket the request arrived on', () => {
  const socket = 'https://0.0.0.0:8080/api/v1/integration';
  assert.equal(
    originOf(new Request(socket, { headers: { 'x-forwarded-host': 'pokter.xyz', 'x-forwarded-proto': 'https' } })),
    'https://pokter.xyz',
  );
  /* The proxy sends `host` when it does not send `x-forwarded-host`. */
  assert.equal(originOf(new Request(socket, { headers: { host: 'pokter.xyz' } })), 'https://pokter.xyz');
  /* A list is a chain of proxies; the first entry is the client's host. */
  assert.equal(
    originOf(new Request(socket, { headers: { 'x-forwarded-host': 'pokter.xyz, internal', 'x-forwarded-proto': 'https, http' } })),
    'https://pokter.xyz',
  );
});

test('a development host keeps its scheme, and https is assumed otherwise', () => {
  assert.equal(originOf(new Request('http://x/y', { headers: { host: 'localhost:4313' } })), 'http://localhost:4313');
  assert.equal(originOf(new Request('http://x/y', { headers: { host: 'www.pokter.xyz' } })), 'https://www.pokter.xyz');
});

/*
 * Nothing forwarded is the in-process case. It falls back to the socket,
 * which is honest about being unreachable, rather than claiming a public
 * host this process was never told it serves.
 */
test('with nothing forwarded it does not invent a host it cannot verify', () => {
  assert.equal(originOf(new Request('https://0.0.0.0:8080/api/v1/integration')), 'https://0.0.0.0:8080');
});

/* `integration/live` reaches the escrow address table and cannot be
   imported here, so the escrow is supplied the way
   `tests/integration-kit.test.mts` supplies it. */
const ESCROW = {
  chainId: 56,
  network: 'BNB Chain',
  commerce: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6',
  router: '0x51895229E12F9876011789B04f8698af06cCD6DA',
  policy: '0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5',
  paymentToken: '0xcE24439F2D9C6a2289F741120FE202248B666666',
};

test('given a real origin the kit publishes no unreachable link anywhere', () => {
  const kit = buildIntegrationKit('https://pokter.xyz', [ESCROW]) as unknown as Record<string, unknown>;
  assert.ok(Array.isArray((kit as { preflight?: unknown[] }).preflight), 'the kit publishes no preflight tools');

  /* Every URL in the whole document, not only the preflight block: the
     bug put the socket into each one that was built from the origin. */
  const urls = JSON.stringify(kit).match(/https?:\/\/[^"\s)\\]+/g) ?? [];
  const unreachable = urls.filter((url) => /0\.0\.0\.0|localhost|127\.0\.0\.1/.test(url));
  assert.deepEqual(unreachable, [], `the kit publishes unreachable hosts:\n  ${unreachable.join('\n  ')}`);
});

test('the kit route builds its links from the forwarded origin', () => {
  const route = readFileSync(new URL('../src/app/api/v1/integration/route.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  assert.match(route, /integrationKit\(originOf\(request\)\)/, 'the kit route no longer uses the forwarded origin');
  assert.doesNotMatch(route, /new URL\(request\.url\)\.origin/, 'the kit route reads the listen socket again');
});
