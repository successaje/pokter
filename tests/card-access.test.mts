import assert from 'node:assert/strict';
import test from 'node:test';

import { cardRequiresAuth } from '../src/lib/proof/card-access';

test('a card that requires an OAuth scope needs a login', () => {
  // The shape of a real card that answered every probe and missed both paid jobs.
  assert.equal(
    cardRequiresAuth({
      securitySchemes: { oauth2: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://example/token', scopes: { invoke: 'Invoke' } } } } },
      security: [{ oauth2: ['invoke'] }],
    }),
    true,
  );
});

test('an empty requirement allows anonymous callers', () => {
  assert.equal(cardRequiresAuth({ security: [{ oauth2: ['invoke'] }, {}] }), false);
});

test('schemes defined but not required do not count', () => {
  assert.equal(cardRequiresAuth({ securitySchemes: { apiKey: { type: 'apiKey' } } }), false);
  assert.equal(cardRequiresAuth({ security: [] }), false);
});

test('anything unreadable is not treated as gated', () => {
  assert.equal(cardRequiresAuth(null), false);
  assert.equal(cardRequiresAuth('card'), false);
  assert.equal(cardRequiresAuth({ security: 'oauth2' }), false);
});
