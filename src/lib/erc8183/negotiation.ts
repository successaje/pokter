import {
  getAddress,
  keccak256,
  recoverMessageAddress,
  toBytes,
  type Address,
  type Hex,
} from 'viem';

/**
 * Verify the BNB Agent Studio EIP-191 quote signature.
 *
 * Studio signs the 32-byte negotiation hash. A few early providers signed the
 * printable 0x-prefixed hash instead, so both EIP-191 encodings are accepted;
 * neither weakens identity because the recovered address must still equal the
 * ERC-8004 agent wallet selected by the buyer.
 */
export async function verifyNegotiationSignature(input: {
  negotiationHash: string;
  providerSignature: string;
  expectedProvider: string;
}): Promise<Address> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.negotiationHash))
    throw new Error('Agent returned an invalid negotiation hash.');
  if (!/^0x[0-9a-fA-F]{130}$/.test(input.providerSignature))
    throw new Error('Agent returned an invalid provider signature.');

  const hash = input.negotiationHash as Hex;
  const signature = input.providerSignature as Hex;
  const expected = getAddress(input.expectedProvider);
  const recovered = await Promise.allSettled([
    recoverMessageAddress({ message: { raw: hash }, signature }),
    recoverMessageAddress({ message: hash, signature }),
  ]);
  const signer = recovered
    .filter(
      (result): result is PromiseFulfilledResult<Address> =>
        result.status === 'fulfilled',
    )
    .map((result) => getAddress(result.value))
    .find((address) => address === expected);
  if (!signer) {
    throw new Error(
      'The negotiation signature does not recover to the selected ERC-8004 provider wallet.',
    );
  }
  return signer;
}

/**
 * Whether a seller's quote can govern a job funded on this escrow chain.
 *
 * A quote is signed against a domain. BNB LP Range Rebalancer quotes with
 * `chain_id: 56` and a verifying contract that is the ERC-8183 commerce
 * deployment on BNB mainnet — a contract with no code at all on testnet. Its
 * `notify_funded` then looks for the funded job carrying that quote, on that
 * chain, and Pokter's escrow is on 97. The quote is valid and the signature
 * recovers; it simply does not describe any job Pokter can create.
 *
 * Carrying such a quote into the envelope is not harmful, but funding against
 * it and expecting delivery is, so the reason is returned rather than a bare
 * false: it is the difference between "this agent is broken" and "this agent
 * does not sell on the chain we settle on", and only the second is true.
 */
export function quoteUsableForEscrow(
  quote: {
    expiresAt?: number;
    domain?: { chainId: number; verifyingContract: Address };
  },
  escrowChainId: number,
  now: Date = new Date(),
): { usable: true } | { usable: false; reason: string } {
  if (quote.domain && quote.domain.chainId !== escrowChainId) {
    return {
      usable: false,
      reason:
        `The seller signed this quote for chain ${quote.domain.chainId}, ` +
        `and the escrow settles on chain ${escrowChainId}. It will not ` +
        `recognise the funded job.`,
    };
  }
  if (quote.expiresAt !== undefined) {
    const expiresAt = quote.expiresAt * 1000;
    if (expiresAt <= now.getTime()) {
      return {
        usable: false,
        reason: 'The quote has expired. Negotiate again before funding.',
      };
    }
  }
  return { usable: true };
}

/*
 * Re-deriving the negotiation hash.
 *
 * A signature over `negotiation_hash` proves who signed a hash, not what the
 * hash covers. BNB's reference SDK (bnbagent-sdk, erc8183/quoteVerify) binds
 * it to the terms: keccak256 of canonical JSON over task, quality terms,
 * price, currency, expiry and the chain/contract binding. This is a port of
 * that derivation so a displayed price can be said to be the signed one only
 * when it actually is.
 */
function sortValue(v: unknown): unknown {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError('canonicalJson: non-finite number');
  if (Array.isArray(v)) return v.map(sortValue);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) out[k] = sortValue((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value)).replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function sanitizeForClaim(s: unknown): string {
  if (typeof s !== 'string') return String(s);
  let out = '';
  for (const ch of s.replaceAll('[', '(').replaceAll(']', ')')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 || ch === '\t' || ch === '\n') out += ch;
  }
  return out;
}

/**
 * The content the reference SDK hashes, or null when the envelope is not an
 * accepted, priced negotiation. `sentTask` stands in for the request when an
 * agent does not echo it back.
 */
export function negotiationContent(envelope: Record<string, unknown>, sentTask?: string): Record<string, unknown> | null {
  const response = (envelope.response ?? {}) as Record<string, unknown>;
  const request = (envelope.request ?? {}) as Record<string, unknown>;
  if (!response.accepted) return null;
  const t = (response.terms ?? {}) as Record<string, unknown>;
  // As the reference: `price || ''`, hashed with whatever type it carries.
  const price = t.price || '';
  const currency = t.currency || '';
  if (!price || !currency) return null;
  // The signature must cover the brief Pokter actually sent, not whatever
  // brief the envelope echoes back (a replayed receipt for another task).
  if (sentTask !== undefined && typeof request.task_description === 'string' && request.task_description !== sentTask) return null;
  const terms: Record<string, unknown> = {
    deliverables: sanitizeForClaim(t.deliverables ?? ''),
    quality_standards: sanitizeForClaim(t.quality_standards ?? ''),
  };
  if (Array.isArray(t.success_criteria) && t.success_criteria.length > 0) terms.success_criteria = t.success_criteria.map(sanitizeForClaim);
  const negotiatedAt = envelope.negotiated_at || response.negotiated_at;
  if (!negotiatedAt) return null;
  const content: Record<string, unknown> = {
    version: 1,
    negotiated_at: negotiatedAt,
    task: sanitizeForClaim(request.task_description ?? sentTask ?? ''),
    terms,
    price,
    currency,
  };
  const expires = envelope.quote_expires_at || response.quote_expires_at;
  if (expires !== undefined && expires !== null) content.quote_expires_at = expires;
  if (envelope.chain_id !== undefined && envelope.chain_id !== null) content.chain_id = envelope.chain_id;
  if (envelope.verifying_contract !== undefined && envelope.verifying_contract !== null) {
    if (typeof envelope.verifying_contract !== 'string') return null;
    try {
      content.verifying_contract = getAddress(envelope.verifying_contract);
    } catch {
      return null;
    }
  }
  return content;
}

/** True when `negotiation_hash` is exactly the hash of the terms in the envelope. */
export function negotiationTermsBound(envelope: Record<string, unknown>, sentTask?: string): boolean {
  const hash = envelope.negotiation_hash;
  if (typeof hash !== 'string') return false;
  const content = negotiationContent(envelope, sentTask);
  if (!content) return false;
  try {
    canonicalJson(content);
  } catch {
    return false;
  }
  return keccak256(toBytes(canonicalJson(content))).toLowerCase() === hash.toLowerCase();
}
