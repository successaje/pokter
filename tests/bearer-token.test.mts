import assert from 'node:assert/strict';
import test from 'node:test';

import { bearerTokenMatches } from '../src/lib/security/bearer';

test('only the exact bearer token matches, compared in constant time', () => {
  const secret = 's3cret-value';
  assert.equal(bearerTokenMatches(`Bearer ${secret}`, secret), true);
  for (const header of [null, '', secret, `bearer ${secret}`, `Bearer ${secret} `, `Bearer ${secret.slice(0, -1)}x`, `Bearer ${secret}${secret}`, 'Bearer ']) {
    assert.equal(bearerTokenMatches(header, secret), false, String(header));
  }
  /* An unset secret never matches, even an empty token. */
  assert.equal(bearerTokenMatches('Bearer ', ''), false);
});
