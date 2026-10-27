import {
  getAddress,
  hashMessage,
  keccak256,
  recoverMessageAddress,
  toBytes,
  type Address,
  type Hex,
} from 'viem';

/** A wallet key's signature: 65 bytes. */
const EOA_SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
/**
 * Any well-formed signature an agent wallet may return: 65 bytes for a key,
 * longer for a smart account answering ERC-1271, bounded because it is
 * carried into a job's on-chain description.
 */
export const PROVIDER_SIGNATURE = /^0x(?:[0-9a-fA-F]{2}){65,1024}$/;

/**
 * Asks a smart-account wallet whether it signed one of these digests
 * (ERC-1271 `isValidSignature`, true only for its magic value). Supplied by
 * a server caller with a chain client, so this module stays free of one.
 */
export type ContractSignatureCheck = (input: { wallet: Address; digests: Hex[]; signature: Hex }) => Promise<boolean>;

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
  /**
   * For an agent wallet that is a smart account. BNB's agent SDK verifies
   * such quotes through ERC-1271; Pokter accepted only 65-byte key
   * signatures, so an agent whose registered wallet is a contract could
   * never have a quote accepted, however correctly it signed. Absent, only
   * key signatures are checked, as before.
   */
  contractSignature?: ContractSignatureCheck;
}): Promise<Address> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.negotiationHash))
    throw new Error('Agent returned an invalid negotiation hash.');
  if (!PROVIDER_SIGNATURE.test(input.providerSignature))
    throw new Error('Agent returned an invalid provider signature.');

  const hash = input.negotiationHash as Hex;
  const signature = input.providerSignature as Hex;
  const expected = getAddress(input.expectedProvider);
  const recovered: PromiseSettledResult<Address>[] = EOA_SIGNATURE.test(signature)
    ? await Promise.allSettled([
        recoverMessageAddress({ message: { raw: hash }, signature }),
        recoverMessageAddress({ message: hash, signature }),
      ])
    : [];
  let signer = recovered
    .filter(
      (result): result is PromiseFulfilledResult<Address> =>
        result.status === 'fulfilled',
    )
    .map((result) => getAddress(result.value))
    .find((address) => address === expected);
  /*
   * The same two EIP-191 encodings, asked of the wallet itself. Only the
   * registered wallet is asked, and only its magic value counts: a
   * contract cannot vouch for any address but its own.
   */
  if (!signer && input.contractSignature) {
    const vouched = await input.contractSignature({ wallet: expected, digests: [hashMessage({ raw: hash }), hashMessage(hash)], signature });
    if (vouched) signer = expected;
  }
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
  /** The escrow contract on that chain. A quote naming another is refused. */
  expectedContract?: string,
): { usable: true } | { usable: false; reason: string; code: 'wrong-chain' | 'wrong-contract' | 'expired' } {
  if (quote.domain && quote.domain.chainId !== escrowChainId) {
    return {
      usable: false,
      code: 'wrong-chain',
      reason:
        `The seller signed this quote for chain ${quote.domain.chainId}, ` +
        `and the escrow settles on chain ${escrowChainId}. It will not ` +
        `recognise the funded job.`,
    };
  }
  /*
   * Right chain, wrong contract: correctly signed, and for a job the seller
   * would never recognise. A quote that names no domain is unbound, not
   * bound to ours, and stays usable; the seller's own check governs it.
   */
  if (quote.domain && expectedContract) {
    let matches = false;
    try {
      matches = getAddress(quote.domain.verifyingContract) === getAddress(expectedContract);
    } catch {
      matches = false;
    }
    if (!matches) {
      return {
        usable: false,
        code: 'wrong-contract',
        reason: `The seller signed this quote for escrow ${quote.domain.verifyingContract}, not the escrow Pokter funds on chain ${escrowChainId}. It will not recognise the funded job.`,
      };
    }
  }
  if (quote.expiresAt !== undefined) {
    const expiresAt = quote.expiresAt * 1000;
    if (expiresAt <= now.getTime()) {
      return {
        usable: false,
        code: 'expired',
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

export function sanitizeForClaim(s: unknown): string {
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

/**
 * Whether the criteria sent are all in the terms the hash covers. The
 * content is already proven to hash to the signed negotiation hash by
 * `negotiationTermsBound`, so membership here is membership in what the
 * agent signed. Compared after the same sanitising the hash applies.
 */
const SPEC_LINE = /^pokter-proofrun\/\d+ spec=0x[0-9a-fA-F]{64}$/;

export function criteriaInSignedTerms(sent: readonly string[] | undefined, content: Record<string, unknown> | null): boolean | null {
  if (!sent || sent.length === 0) return null;
  const signed = (content?.terms as { success_criteria?: unknown } | undefined)?.success_criteria;
  if (!Array.isArray(signed)) return false;
  const have = new Set(signed.map((c) => String(c)));
  /*
   * When the criteria carry a spec-hash line (ProofRun's
   * `pokter-proofrun/<v> spec=0x…`), that exact line is what makes the
   * agreement checkable, and the prose lines are for the seller to read. An
   * agent that tidied whitespace in the prose has still signed the spec.
   * Without such a line every criterion must be there.
   */
  const specLine = sent.find((c) => SPEC_LINE.test(c));
  if (specLine) return have.has(sanitizeForClaim(specLine));
  return sent.every((c) => have.has(sanitizeForClaim(c)));
}
