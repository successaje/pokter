import assert from 'node:assert/strict';
import test from 'node:test';

import { a2aCardFallback, cardRequiresAuth } from '../src/lib/proof/card-access';

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


test('a base URL falls back to the well-known card path', () => {
  assert.equal(a2aCardFallback('https://honeyglass.onrender.com'), 'https://honeyglass.onrender.com/.well-known/agent-card.json');
  assert.equal(a2aCardFallback('https://example.com/api/a2a'), 'https://example.com/.well-known/agent-card.json');
});

test('an index that names its card is followed, on the same host only', () => {
  // The shape of the real index that failed the check.
  const index = { name: 'Honeyglass', agentCard: '/.well-known/agent-card.json', rpc: 'POST / (JSON-RPC 2.0)' };
  assert.equal(a2aCardFallback('https://honeyglass.onrender.com', index), 'https://honeyglass.onrender.com/.well-known/agent-card.json');
  assert.equal(a2aCardFallback('https://a.example/', { agentCard: '/cards/main.json' }), 'https://a.example/cards/main.json');
  assert.equal(a2aCardFallback('https://a.example/', { agentCard: 'https://evil.example/card.json' }), 'https://a.example/.well-known/agent-card.json');
});

test('the well-known card itself has no fallback, so nothing loops', () => {
  assert.equal(a2aCardFallback('https://a.example/.well-known/agent-card.json'), null);
  assert.equal(a2aCardFallback('https://a.example/.well-known/agent.json'), null);
  assert.equal(a2aCardFallback('not a url'), null);
});
