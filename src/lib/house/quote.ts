import { getAddress, keccak256, parseUnits, toBytes, type LocalAccount } from 'viem';

import { canonicalJson, sanitizeForClaim } from '@/lib/erc8183/negotiation';
import { MAX_TERM_LENGTH, MAX_TERM_STRINGS } from '@/lib/proofrun/acceptance';

import type { HouseAgentDefinition, HouseChainId } from './types';

const QUOTE_TTL_SECONDS = 15 * 60;

/**
 * The criteria from a negotiate request, if they are safe to sign.
 *
 * A seller signs whatever it echoes, so this is untrusted input on its way
 * into a signature. Each string is bounded and sanitised, and the caller
 * must get back either the whole array or nothing: `bindingFor` requires
 * every criterion it sent to appear in the signed terms, so echoing a
 * filtered subset would produce a signature that binds nothing while
 * looking like it binds something.
 *
 * Malformed or oversized input therefore costs the binding and not the
 * hire. The quote still verifies and the job can still be funded; the
 * delivery is simply judged against criteria the agent did not sign, which
 * is what `pokter-asserted` already means. Refusing the quote outright
 * would contradict the kit's own promise that omitting the field "refuses
 * nothing", and would break a hire over a field that is optional.
 *
 * The bounds come from `acceptance.ts` rather than a copy, because they
 * are the limits Pokter publishes in the integration kit and a second
 * copy would drift from the documented one.
 */
export function echoableCriteria(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TERM_STRINGS) return undefined;
  const lines: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return undefined;
    /* Sanitising can only shorten, so the length is checked on what is
       signed rather than on what arrived. */
    const line = sanitizeForClaim(entry);
    if (line.trim().length === 0 || line.length > MAX_TERM_LENGTH) return undefined;
    lines.push(line);
  }
  return lines;
}

export interface HouseSignedQuote {
  request: { task_description: string };
  response: {
    accepted: true;
    terms: { price: string; currency: string; deliverables: string; quality_standards: string; success_criteria?: string[] };
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
  /**
   * The acceptance criteria the buyer asked this quote to be bound to.
   *
   * Echoed into the signed terms, which is what turns them from something
   * Pokter recorded into something the agent agreed to: `negotiationContent`
   * hashes `terms.success_criteria`, so a signature over the negotiation
   * hash covers them. ProofRun reads that back through `bindingFor` and
   * reports `signed-terms` instead of `pokter-asserted`.
   *
   * Absent is the ordinary case and costs only the binding — it must never
   * become a requirement that breaks an agent which does not send them.
   */
  successCriteria?: readonly string[];
  now?: number;
}): Promise<HouseSignedQuote> {
  const negotiatedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const criteria = (input.successCriteria ?? []).map(sanitizeForClaim);
  const expiresAt = negotiatedAt + QUOTE_TTL_SECONDS;
  const terms = {
    price: parseUnits(String(input.definition.priceU), 18).toString(),
    currency: input.paymentToken,
    deliverables: sanitizeForClaim(input.deliverables ?? input.definition.deliverables),
    quality_standards: sanitizeForClaim(input.qualityStandards ?? input.definition.qualityStandards),
    /*
     * Sanitised per element, exactly as `negotiationContent` does before
     * hashing. A criterion carrying a bracket would otherwise hash here one
     * way and there another, and the quote would be refused as
     * terms-mismatch for a signature that was perfectly correct.
     */
    ...(criteria.length > 0 ? { success_criteria: criteria } : {}),
  };
  const content = {
    version: 1,
    negotiated_at: negotiatedAt,
    task: sanitizeForClaim(input.task),
    terms: {
      deliverables: terms.deliverables,
      quality_standards: terms.quality_standards,
      /* Present in the hash only when sent, matching `negotiationContent`:
         an empty array there is absent, not an empty list. */
      ...(criteria.length > 0 ? { success_criteria: criteria } : {}),
    },
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
