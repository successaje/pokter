import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { a2aInterfaces, isAgentCard, jsonRpcEndpoint } from '../src/lib/a2a/card';

test('a v0.3 card: the top-level url, JSON-RPC unless it says otherwise', () => {
  const card = { name: 'A', skills: [], url: 'https://a.example/rpc', protocolVersion: '0.3.0' };
  assert.equal(jsonRpcEndpoint(card), 'https://a.example/rpc');
  assert.equal(isAgentCard(card), true);
});

test('a v0.3 card whose preferred transport is not JSON-RPC uses its JSON-RPC additional interface', () => {
  const card = {
    name: 'A', skills: [], url: 'https://a.example/grpc', preferredTransport: 'GRPC',
    additionalInterfaces: [{ url: 'https://a.example/grpc', transport: 'GRPC' }, { url: 'https://a.example/jsonrpc', transport: 'JSONRPC' }],
  };
  assert.equal(jsonRpcEndpoint(card), 'https://a.example/jsonrpc');
});

test('a current card with only supportedInterfaces is a card, and its JSON-RPC binding is chosen', () => {
  const card = {
    name: 'B', skills: [{ id: 'x' }],
    supportedInterfaces: [
      { url: 'https://b.example/v1', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0' },
      { url: 'https://b.example/rpc', protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
    ],
  };
  assert.equal(isAgentCard(card), true);
  assert.equal(jsonRpcEndpoint(card), 'https://b.example/rpc');
  assert.deepEqual(a2aInterfaces(card).map((i) => i.binding), ['HTTP+JSON', 'JSONRPC']);
});

test('no JSON-RPC interface, or only plain HTTP, means nothing Pokter can call', () => {
  assert.equal(jsonRpcEndpoint({ name: 'C', skills: [], supportedInterfaces: [{ url: 'https://c.example', protocolBinding: 'GRPC' }] }), null);
  assert.equal(jsonRpcEndpoint({ name: 'C', skills: [], url: 'http://c.example/rpc' }), null);
  assert.equal(isAgentCard({ name: 'D', skills: [] }), false);
});

test('the live cards in the fixtures still resolve to the URL Pokter used before', () => {
  for (const name of ['stockroom', 'ivl']) {
    let card: Record<string, unknown>;
    try {
      card = JSON.parse(readFileSync(new URL(`./fixtures/card-${name}.json`, import.meta.url), 'utf8'));
    } catch {
      continue; // Fixtures arrive with the capability-brief branch.
    }
    assert.equal(jsonRpcEndpoint(card), card.url);
  }
});
