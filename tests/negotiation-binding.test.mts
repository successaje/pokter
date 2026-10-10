import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, toBytes } from 'viem';

import { canonicalJson, negotiationContent, negotiationTermsBound } from '../src/lib/erc8183/negotiation';

function envelope(price: string) {
  const base: Record<string, unknown> = {
    request: { task_description: 'Assess [risk]', terms: {} },
    response: {
      accepted: true,
      negotiated_at: 1_760_000_000,
      quote_expires_at: 1_760_000_900,
      terms: { price, currency: '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565', deliverables: 'JSON', quality_standards: 'Read-only' },
    },
    chain_id: 97,
    verifying_contract: '0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de',
  };
  return base;
}

test('the hash of the reference content binds the terms', () => {
  const e = envelope('100000000000000000');
  const content = negotiationContent(e)!;
  assert.equal(content.task, 'Assess (risk)', 'brackets are sanitised as in the reference SDK');
  e.negotiation_hash = keccak256(toBytes(canonicalJson(content)));
  assert.equal(negotiationTermsBound(e), true);
});

test('a hash replayed with a different price is not bound', () => {
  const signed = envelope('100000000000000000');
  const hash = keccak256(toBytes(canonicalJson(negotiationContent(signed)!)));
  const forged = envelope('900000000000000000');
  forged.negotiation_hash = hash;
  assert.equal(negotiationTermsBound(forged), false);
});

test('a declined negotiation binds nothing', () => {
  const e = envelope('1');
  (e.response as Record<string, unknown>).accepted = false;
  e.negotiation_hash = '0x' + '0'.repeat(64);
  assert.equal(negotiationTermsBound(e), false);
});

test('canonical JSON sorts keys and escapes non-ASCII', () => {
  assert.equal(canonicalJson({ b: 1, a: 'é' }), '{"a":"\\u00e9","b":1}');
});
