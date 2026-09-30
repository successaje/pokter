import type { Address } from 'viem';

export const BUILDER_CHALLENGE_TTL_MS = 10 * 60_000;

export function builderVerificationMessage(input: {
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
