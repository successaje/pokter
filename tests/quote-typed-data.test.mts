import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';

import { quoteTypedData, verifyNegotiationSignature } from '../src/lib/erc8183/negotiation';

/*
 * A wallet that signs only typed data can still sell. A Binance Agentic
 * Wallet refuses a plain message (the service answers 351817), so its Agent
 * ID holder could hire, post a request and review, but never quote a price.
 */

const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const account = privateKeyToAccount(KEY);
const HASH = '0x9c1185a5c5e9fc54612808977ee8f548b2258d31a7c4b1e2d3f5a6b7c8d9e0f1' as const;

const signTyped = (chainId: number) => account.signTypedData(quoteTypedData(HASH, chainId));

test('a typed-data quote signed for the quote’s own chain is accepted', async () => {
  const signer = await verifyNegotiationSignature({
    negotiationHash: HASH,
    providerSignature: await signTyped(56),
    expectedProvider: account.address,
    typedDataChainId: 56,
  });
  assert.equal(signer, account.address);
});

test('the same signature is refused for another chain, so a quote cannot be replayed across chains', async () => {
  const signature = await signTyped(56);
  await assert.rejects(
    verifyNegotiationSignature({ negotiationHash: HASH, providerSignature: signature, expectedProvider: account.address, typedDataChainId: 97 }),
    /does not recover to the selected ERC-8004 provider wallet/,
  );
});

test('without a chain to bind to, the typed-data form is not accepted at all', async () => {
  await assert.rejects(
    verifyNegotiationSignature({ negotiationHash: HASH, providerSignature: await signTyped(56), expectedProvider: account.address }),
    /does not recover to the selected ERC-8004 provider wallet/,
  );
});

test('a typed-data signature by any other wallet is refused', async () => {
  const other = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
  await assert.rejects(
    verifyNegotiationSignature({ negotiationHash: HASH, providerSignature: await signTyped(56), expectedProvider: other.address, typedDataChainId: 56 }),
    /does not recover to the selected ERC-8004 provider wallet/,
  );
});

test('a typed-data signature over a different hash does not pass for this one', async () => {
  const elsewhere = await account.signTypedData(quoteTypedData('0x1111111111111111111111111111111111111111111111111111111111111111', 56));
  await assert.rejects(
    verifyNegotiationSignature({ negotiationHash: HASH, providerSignature: elsewhere, expectedProvider: account.address, typedDataChainId: 56 }),
    /does not recover to the selected ERC-8004 provider wallet/,
  );
});

test('the two EIP-191 forms still pass with the typed-data option present', async () => {
  for (const message of [{ raw: HASH } as const, HASH]) {
    const signer = await verifyNegotiationSignature({
      negotiationHash: HASH,
      providerSignature: await account.signMessage({ message }),
      expectedProvider: account.address,
      typedDataChainId: 56,
    });
    assert.equal(signer, account.address);
  }
});

test('the struct commits to the hash and the chain, and names no verifying contract', () => {
  const typed = quoteTypedData(HASH, 56);
  assert.deepEqual(typed.message, { negotiationHash: HASH });
  assert.equal(typed.domain.chainId, 56);
  assert.equal('verifyingContract' in typed.domain, false, 'nothing on chain verifies this, so naming a contract would be decoration');
  assert.deepEqual(typed.types.Quote, [{ name: 'negotiationHash', type: 'bytes32' }]);
});
