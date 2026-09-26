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
