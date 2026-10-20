import type { Address } from 'viem';

export const BUILDER_CHALLENGE_TTL_MS = 10 * 60_000;

/**
 * What an owner signs to prove control of an agent's owner wallet.
 *
 * It names the site it is for, so a signature collected by a page that
 * merely imitates Pokter is for that page's domain and verifies nowhere
 * else, as well as the identity, owner, a single-use nonce and an expiry.
 */
export function builderVerificationMessage(input: {
  /** The host the signature is for, such as pokter.xyz. */
  domain: string;
  challengeId: string;
  nonce: string;
  chainId: number;
  tokenId: string;
  owner: Address;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    'Pokter publisher ownership verification',
    `Domain: ${input.domain}`,
    `URI: https://${input.domain}/build/import`,
    'Purpose: Prove control of an ERC-8004 owner wallet',
    `Agent identity: ${input.chainId}:${input.tokenId}`,
    `Owner wallet: ${input.owner}`,
    `Challenge: ${input.challengeId}`,
    `Nonce: ${input.nonce}`,
    `Issued at: ${input.issuedAt}`,
    `Expires at: ${input.expiresAt}`,
    '',
    'This signature does not authorize transactions or give Pokter access to funds.',
  ].join('\n');
}
