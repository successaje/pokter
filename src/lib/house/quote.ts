import { getAddress, keccak256, parseUnits, toBytes, type LocalAccount } from 'viem';

import { canonicalJson, sanitizeForClaim } from '@/lib/erc8183/negotiation';

import type { HouseAgentDefinition, HouseChainId } from './types';

const QUOTE_TTL_SECONDS = 15 * 60;

export interface HouseSignedQuote {
  request: { task_description: string };
  response: {
    accepted: true;
    terms: { price: string; currency: string; deliverables: string; quality_standards: string };
  };
  negotiated_at: number;
  quote_expires_at: number;
  chain_id: number;
  verifying_contract: string;
  negotiation_hash: string;
  provider_sig: string;
}

/**
 * Sign a quote whose hash any verifier re-derives.
 *
 * The task is hashed after the reference SDK's own sanitising (brackets to
 * parentheses, control characters dropped), because that is what
 * `negotiationContent` and the sellers' verifiers hash. Hashing the raw
 * text would sign a digest no buyer's check reproduces for a brief with a
 * bracket in it.
 */
export async function signHouseQuote(input: {
  definition: HouseAgentDefinition;
  account: LocalAccount;
  chainId: HouseChainId;
  paymentToken: string;
  verifyingContract: string;
  task: string;
  deliverables?: string;
  qualityStandards?: string;
  now?: number;
}): Promise<HouseSignedQuote> {
  const negotiatedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const expiresAt = negotiatedAt + QUOTE_TTL_SECONDS;
  const terms = {
    price: parseUnits(String(input.definition.priceU), 18).toString(),
    currency: input.paymentToken,
    deliverables: sanitizeForClaim(input.deliverables ?? input.definition.deliverables),
    quality_standards: sanitizeForClaim(input.qualityStandards ?? input.definition.qualityStandards),
  };
  const content = {
    version: 1,
    negotiated_at: negotiatedAt,
    task: sanitizeForClaim(input.task),
    terms: { deliverables: terms.deliverables, quality_standards: terms.quality_standards },
    price: terms.price,
    currency: terms.currency,
    quote_expires_at: expiresAt,
    chain_id: input.chainId,
    // Checksummed: verifiers normalise it with getAddress before hashing.
    verifying_contract: getAddress(input.verifyingContract),
  };
  const negotiationHash = keccak256(toBytes(canonicalJson(content)));
  // EIP-191 over the raw 32 bytes: what `verifyNegotiationSignature` recovers against.
  const signature = await input.account.signMessage({ message: { raw: negotiationHash } });
  return {
    request: { task_description: input.task },
    response: { accepted: true, terms },
    negotiated_at: negotiatedAt,
    quote_expires_at: expiresAt,
    chain_id: input.chainId,
    verifying_contract: getAddress(input.verifyingContract),
    negotiation_hash: negotiationHash,
    provider_sig: signature,
  };
}
