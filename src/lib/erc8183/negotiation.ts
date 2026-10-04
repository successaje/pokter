import {
  getAddress,
  recoverMessageAddress,
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
