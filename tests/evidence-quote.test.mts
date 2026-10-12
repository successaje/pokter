import assert from 'node:assert/strict';
import test from 'node:test';
import { hashMessage, keccak256, parseUnits, toBytes, verifyMessage } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { canonicalJson, negotiationTermsBound } from '../src/lib/erc8183/negotiation';

/**
 * The signing path, reproduced against Pokter's own verifier.
 *
 * `negotiate.ts` is `server-only` and resolves the operator key, so it
 * cannot be imported here. What is pinned instead is the contract it has
 * to satisfy: the digest it signs, and that `negotiationTermsBound`
 * re-derives the same hash from the envelope it returns. A signature over
 * any other digest recovers a valid signer and still fails that check —
 * it would prove who answered, not that this price is what they signed.
 */
const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const account = privateKeyToAccount(KEY);

const TASK = 'Quote your standard deliverable so a buyer can see the price before hiring.';
const TERMS = {
  price: parseUnits('0.01', 18).toString(),
  currency: '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565',
  deliverables: 'Pokter’s measured record for the named ERC-8004 agent.',
  quality_standards: 'Measurements only.',
};

function envelope(negotiatedAt: number) {
  const expiresAt = negotiatedAt + 900;
  const content = {
    version: 1,
    negotiated_at: negotiatedAt,
    task: TASK,
    terms: {
      deliverables: TERMS.deliverables,
      quality_standards: TERMS.quality_standards,
    },
    price: TERMS.price,
    currency: TERMS.currency,
    quote_expires_at: expiresAt,
    chain_id: 97,
    verifying_contract: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE',
  };
  return {
    hash: keccak256(toBytes(canonicalJson(content))),
    body: {
      request: { task_description: TASK },
      response: { accepted: true, terms: TERMS },
      negotiated_at: negotiatedAt,
      quote_expires_at: expiresAt,
      chain_id: 97,
      verifying_contract: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE',
    },
  };
}

test('the hash the agent signs is the hash Pokter re-derives from the envelope', () => {
  const { hash, body } = envelope(1_760_000_000);
  assert.ok(
    negotiationTermsBound({ ...body, negotiation_hash: hash }, TASK),
    'a hash over anything else proves who answered, not what they priced',
  );
});

test('a price changed after signing no longer binds', () => {
  const { hash, body } = envelope(1_760_000_000);
  const tampered = {
    ...body,
    response: { accepted: true, terms: { ...TERMS, price: parseUnits('99', 18).toString() } },
    negotiation_hash: hash,
  };
  assert.equal(negotiationTermsBound(tampered, TASK), false);
});

test('a quote signed for one brief does not govern another', () => {
  const { hash, body } = envelope(1_760_000_000);
  assert.equal(
    negotiationTermsBound({ ...body, negotiation_hash: hash }, 'Rebalance my portfolio'),
    false,
  );
});

test('the EIP-191 digest recovers to the signing wallet', async () => {
  const { hash } = envelope(1_760_000_000);
  /* What negotiate.ts does: personal-sign prefix applied before signDigest. */
  const signature = await account.sign({ hash: hashMessage({ raw: hash }) });
  assert.ok(
    await verifyMessage({ address: account.address, message: { raw: hash }, signature }),
    'this is the encoding verifyNegotiationSignature inverts',
  );
});

/**
 * How a bad operator key is described.
 *
 * `altana/client` is server-only and cannot be imported here, so the
 * branch is mirrored. It is worth pinning: both cases reported "is not
 * set", so a key that was present but pasted without its prefix sent the
 * reader to check a secret that was already deployed with a digest.
 */
function keyFault(key: string | undefined): 'absent' | 'malformed' | null {
  if (!key) return 'absent';
  if (!key.startsWith('0x')) return 'malformed';
  return null;
}

test('a missing key and a malformed key are told apart', () => {
  assert.equal(keyFault(undefined), 'absent');
  assert.equal(keyFault(''), 'absent');
  assert.equal(
    keyFault('abc123notprefixed'),
    'malformed',
    'calling this "not set" points at the wrong half of the condition',
  );
  assert.equal(keyFault('0xabc123'), null);
});
