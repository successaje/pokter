import assert from 'node:assert/strict';
import test from 'node:test';

import * as Key from 'porto/viem/Key';
import * as P256 from 'ox/P256';
import * as PublicKey from 'ox/PublicKey';
import * as Signature from 'ox/Signature';
import { hashMessage, hashTypedData, isHex, type Hex } from 'viem';

/*
 * What a passkey wallet has to sign for Pokter's ownership check.
 *
 * The server verifies with viem's `verifyMessage` against the registered
 * owner. For a contract account that becomes
 * `isValidSignature(hashMessage(message), signature)`, and the account
 * validates by re-deriving an `ERC1271Sign` typed-data digest bound to
 * itself as `verifyingContract`.
 *
 * The one thing Pokter's code decides is which digest to hand Porto. Get
 * that wrong and the signature is valid over something nobody will ever
 * check — it would recover cleanly in a unit test and be rejected on
 * chain. So the account's derivation is written out here from the
 * ERC-1271 type definition, independently of Porto, and the signature
 * Porto produced is verified against it.
 *
 * A plain P256 key is used rather than a WebAuthn one because its
 * signature is the bare P256 pair: it isolates the payload question from
 * the WebAuthn envelope, which is Porto's business and not ours. The
 * WebAuthn path is exercised separately below for shape only.
 */

const ACCOUNT = '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87' as const;
const MESSAGE = [
  'Pokter publisher ownership verification',
  'Agent identity: 97:2599',
  'Challenge: 0a0f1f0e-1234-4bee-9999-000000000000',
].join('\n');

/** The digest the account derives, from the ERC-1271 types themselves. */
function erc1271Digest(account: `0x${string}`, digest: Hex): Hex {
  return hashTypedData({
    domain: { verifyingContract: account },
    types: { ERC1271Sign: [{ name: 'digest', type: 'bytes32' }] },
    primaryType: 'ERC1271Sign',
    message: { digest },
  });
}

test('passing the account makes Porto sign the digest the account will check', async () => {
  const privateKey = P256.randomPrivateKey();
  const key = Key.fromP256({ privateKey, role: 'admin' });

  const signature = await Key.sign(key, {
    address: ACCOUNT,
    payload: hashMessage(MESSAGE),
    wrap: false,
  });

  assert.equal(
    P256.verify({
      payload: erc1271Digest(ACCOUNT, hashMessage(MESSAGE)),
      publicKey: PublicKey.fromHex(`0x04${key.publicKey.slice(2)}`),
      signature: Signature.fromHex(signature),
    }),
    true,
    'signed over the ERC-1271 digest bound to the account',
  );

  /* And not over the bare message hash, which is the mistake available. */
  assert.equal(
    P256.verify({
      payload: hashMessage(MESSAGE),
      publicKey: PublicKey.fromHex(`0x04${key.publicKey.slice(2)}`),
      signature: Signature.fromHex(signature),
    }),
    false,
  );
});

test('omitting the account signs something the chain would reject', async () => {
  /*
   * The failure this guards against. Without `address` Porto signs the
   * bare payload, which verifies perfectly off-chain and is rejected by
   * `isValidSignature`, because the account looks for the nested digest.
   *
   * Porto's own types require `address`, so this is reachable only past a
   * cast — which is most of the defence. The rest is here: if that
   * requirement is ever relaxed, this says what the consequence is.
   */
  const privateKey = P256.randomPrivateKey();
  const key = Key.fromP256({ privateKey, role: 'admin' });
  const signature = await Key.sign(key, {
    payload: hashMessage(MESSAGE),
    wrap: false,
  } as unknown as Key.sign.Parameters);

  const publicKey = PublicKey.fromHex(`0x04${key.publicKey.slice(2)}`);
  assert.equal(
    P256.verify({ payload: hashMessage(MESSAGE), publicKey, signature: Signature.fromHex(signature) }),
    true,
  );
  assert.equal(
    P256.verify({
      payload: erc1271Digest(ACCOUNT, hashMessage(MESSAGE)),
      publicKey,
      signature: Signature.fromHex(signature),
    }),
    false,
  );
});

test('the digest is bound to the account, so a signature cannot be replayed as another', () => {
  const other = '0x000000000000000000000000000000000000dEaD' as const;
  assert.notEqual(
    erc1271Digest(ACCOUNT, hashMessage(MESSAGE)),
    erc1271Digest(other, hashMessage(MESSAGE)),
  );
});

test('a headless WebAuthn key signs through the same call', async () => {
  /* Shape only: the envelope is Porto's, and whether the account accepts
     it is answered on chain, not here. */
  const key = Key.fromHeadlessWebAuthnP256({
    privateKey: P256.randomPrivateKey(),
    role: 'admin',
  });
  const signature = await Key.sign(key, { address: ACCOUNT, payload: hashMessage(MESSAGE) });
  assert.ok(isHex(signature) && signature.length > 200, 'a wrapped WebAuthn signature');
});
