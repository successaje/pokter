import assert from 'node:assert/strict';
import test from 'node:test';

import { diagnosticPacket, redactSecrets } from '../src/lib/diagnostic/packet';

test('secrets in URLs, headers and labelled fields are redacted', () => {
  const out = redactSecrets('GET https://agent.example/a2a?api_key=sk_live_123&x=1 with Bearer abc.def and token: xyz123');
  assert.doesNotMatch(out, /sk_live_123|abc\.def|xyz123/);
  assert.match(out, /https:\/\/agent\.example\/a2a\?\[redacted\]/);
});

test('the packet carries identity, time, each check and its fix', () => {
  const text = diagnosticPacket({
    chainId: 56, tokenId: '374112', name: 'Cresthold', owner: null, agentWallet: '0xA457',
    observedAt: '2026-10-17T12:00:00.000Z',
    checks: [{ id: 'quote', label: 'Signed quote', status: 'fail', detail: 'No negotiate skill on https://x.example/card?key=s3cret', remedy: 'Add a negotiate skill.', code: 'no-price-skill', fixUrl: '/build/integration#quote' }],
  });
  assert.match(text, /ERC-8004 56:374112/);
  assert.match(text, /2026-10-17T12:00:00.000Z/);
  assert.match(text, /\[FAIL\] Signed quote \(code: no-price-skill\)/);
  assert.match(text, /Docs: https:\/\/pokter\.xyz\/build\/integration#quote/);
  assert.doesNotMatch(text, /s3cret/);
});
