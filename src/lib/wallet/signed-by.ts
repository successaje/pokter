import { verifyMessage, type Address, type Hex } from 'viem';

import { registryClient } from '@/lib/registry/onchain';

/**
 * Whether a wallet signed a message — EOA or contract account.
 *
 * Lifted out of the publisher verification route so the buyer notification
 * claim uses the same check rather than a second copy of it. Two places
 * deciding independently what counts as a valid wallet signature is how one
 * of them ends up weaker than the other.
 *
 * `verifyMessage` from viem recovers an EOA and nothing else, so a smart
 * account could own a wallet and never prove it. With a chain client the
 * same call falls through to ERC-1271, which is how a contract wallet says
 * a signature is its own. EOAs are unaffected.
 */
export async function signedByWallet(chainId: number, owner: Address, message: string, signature: Hex): Promise<boolean> {
  const client = registryClient(chainId);
  try {
    if (client) return await client.verifyMessage({ address: owner, message, signature });
  } catch {
    /* An RPC failure must not pass an unverified signature; fall back to
       the local EOA check, which is what this did before. */
  }
  return verifyMessage({ address: owner, message, signature });
}

/** An EIP-191 signature is 65 bytes; a contract-wallet signature is not. */
export function looksLikeEoaSignature(signature: Hex): boolean {
  return signature.length === 132;
}

/**
 * Whether a smart-account signature could be checked at all.
 *
 * A smart account validates its own signatures, so if it has no code the
 * check cannot even be attempted — and the Altana SDK is explicit that a
 * freshly created wallet is counterfactual until its first `execute`. A
 * wallet in that state is told what is actually true, rather than that its
 * signature did not match, which would send somebody hunting for a wallet
 * they do not have.
 */
export async function walletCanBeChecked(chainId: number, owner: Address, signature: Hex): Promise<boolean> {
  if (looksLikeEoaSignature(signature)) return true;
  const client = registryClient(chainId);
  if (!client) return true;
  try {
    const code = await client.getCode({ address: owner });
    return Boolean(code && code !== '0x');
  } catch {
    /* Unknown is not a refusal: let the signature check decide. */
    return true;
  }
}
