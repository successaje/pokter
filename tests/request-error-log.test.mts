import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestError } from '../src/instrumentation';

/*
 * A server error is logged with the request it failed, so a burst can be
 * traced to a page, and without the query string or headers, which can
 * carry a wallet, a token or a cookie.
 */

test('a request error is logged with its method, path and route, and nothing private', async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  try {
    const error = Object.assign(new Error('The destination stream closed early.'), { digest: '713983349' });
    await onRequestError(
      error,
      { path: '/agents/56/374113?wallet=0x00000000000000000000000000000000000000b1&token=abc', method: 'GET', headers: { cookie: 'session=secret', authorization: 'Bearer secret' } },
      { routerKind: 'App Router', routePath: '/(site)/agents/[chainId]/[tokenId]', routeType: 'render', renderSource: 'server-rendering', revalidateReason: undefined, renderType: 'dynamic' } as never,
    );
  } finally {
    console.error = original;
  }
  assert.deepEqual(lines, ['[request-error] GET /agents/56/374113 route=/(site)/agents/[chainId]/[tokenId] type=render digest=713983349: The destination stream closed early.']);
  assert.doesNotMatch(lines[0], /wallet|token=|secret|cookie/);
});
