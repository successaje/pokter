'use client';

import * as Key from 'porto/viem/Key';
import * as PublicKey from 'ox/PublicKey';
import { hashMessage, type Hex } from 'viem';

import type { StoredWallet } from './passkey';

/**
 * A message signature from a passkey wallet, which the chain can check.
 *
 * Pokter offered passkeys so somebody could take part without holding a
 * key, and then every place that proves ownership asked for a signature a
 * passkey "cannot produce". That was true of the shape being asked for
 * and not of the wallet: the SDK's `Signer.signDigest` throws for passkey
 * signers, because the passkey is P256 and the signature has to be
 * wrapped the way the account expects.
 *
 * The account expects ERC-1271. Its delegate implements
 * `isValidSignature(bytes32, bytes)` — verified against the live account
 * 0x60eF1484…, which answers 0xffffffff for a signature it rejects rather
 * than reverting — and Porto's `Key.sign` produces exactly the envelope
 * that function validates: given `address`, it nests the digest in an
 * `ERC1271Sign` typed-data payload bound to the account as
 * `verifyingContract`, and the account re-derives the same nesting when
 * it checks.
 *
 * So the digest signed here is `hashMessage(message)` and nothing else,
 * because that is what viem hands `isValidSignature` on the other side.
 * Wrapping it ourselves would produce a signature over a digest nobody
 * will ever check.
 *
 * Imported from `porto` and `ox` directly, which are now declared
 * dependencies pinned to the versions the Altana SDK resolves, because
 * the SDK keeps its own equivalent of this behind an export map that
 * exposes only the package root.
 */
export async function signPasskeyMessage(
  wallet: StoredWallet,
  message: string,
  webAuthn?: { getFn?: NonNullable<Key.sign.Parameters['webAuthn']>['getFn'] },
): Promise<Hex> {
  const key = portoKeyFor(wallet);
  const signature = await Key.sign(key, {
    /*
     * The account, not the key. This is what switches Porto from signing
     * a bare digest to signing the ERC-1271 envelope, and it is the
     * difference between a signature the chain accepts and one it does
     * not.
     */
    address: wallet.address,
    payload: hashMessage(message),
    ...(webAuthn ? { webAuthn } : {}),
  });
  return signature as Hex;
}

/**
 * The passkey as Porto's admin key.
 *
 * Admin rather than a session key on purpose. A session key's ERC-1271
 * signature is only valid for contracts the account has approved as
 * signature checkers, and the party checking here is Pokter's server
 * making an `eth_call` with no sender to approve. The admin key carries
 * the account's own authority and needs no approval.
 */
function portoKeyFor(wallet: StoredWallet) {
  const credential = wallet.credential;
  if (credential.kind !== 'webauthn') {
    throw new Error('This passkey cannot sign in a browser.');
  }
  /*
   * Stored flat (x || y); `PublicKey.fromHex` wants the SEC1 form, so the
   * 0x04 prefix goes back on first. Same conversion the SDK makes.
   */
  const publicKey = PublicKey.fromHex(`0x04${credential.publicKey.slice(2)}`);
  return Key.fromWebAuthnP256({
    credential: { id: credential.id, publicKey },
    ...(credential.rpId ? { rpId: credential.rpId } : {}),
    role: 'admin',
  });
}
