import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';

import { builderVerificationMessage } from '../src/lib/builders/verification.js';

const account = privateKeyToAccount('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');

test('publisher verification binds the signature to one identity and challenge', async () => {
  const input = {
    challengeId: 'challenge-1', nonce: 'nonce-1', chainId: 56, tokenId: '265375',
    owner: account.address, issuedAt: '2026-09-30T20:00:00.000Z', expiresAt: '2026-09-30T20:10:00.000Z',
  };
  const message = builderVerificationMessage(input);
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  assert.equal(await verifyMessage({ address: account.address, message: builderVerificationMessage({ ...input, tokenId: '265376' }), signature }), false);
  assert.match(message, /does not authorize transactions or give Pokter access to funds/);
});
