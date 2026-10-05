'use client';

import type { Address, Hex } from 'viem';

import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import type { RegistryChainId, RegistrySigner } from './register';
import { passkeyChainRefusal } from './passkey-chain';

/**
 * Publish an identity from a passkey wallet.
 *
 * Pokter offers passkeys so somebody can take part without holding a key,
 * and then required an injected browser wallet to publish — so the people
 * most likely to be building on testnet were the ones who could not list
 * what they built. Registration is two ordinary calls, and the passkey
 * wallet already executes exactly that shape for hiring.
 *
 * One transaction per call rather than a batch. The second call needs the
 * agent id the first one assigns, which is only knowable from its receipt,
 * so there is nothing to batch: the sequence is a dependency, not a
 * convenience. Registration already resumes from a recorded hash if the
 * browser closes between the two.
 */
export function passkeyRegistrySigner(input: {
  wallet: { address: Address };
  signer: unknown;
  chainId: RegistryChainId;
}): RegistrySigner {
  /*
   * The passkey client is built for one network, so it can only sign for
   * the chain it was configured with. Saying that plainly beats letting the
   * send fail somewhere inside the SDK with a message about the wrong
   * chain id, which is what a silent mismatch would produce.
   */
  const refusal = passkeyChainRefusal(input.chainId, WALLET_NETWORK.chainId);
  if (refusal) throw new Error(refusal);

  return {
    address: input.wallet.address,
    /* A smart wallet has no network to switch; it is already on one. */
    prepare: async () => {},
    send: async (call) => {
      const outcome = await walletClient().execute({
        wallet: { address: input.wallet.address },
        signer: input.signer as never,
        calls: [{ to: call.to, data: call.data }],
        chainId: WALLET_NETWORK.chainId,
      });
      const hash = (outcome as { transactionHash?: Hex }).transactionHash;
      if (!hash) {
        /*
         * The caller reads a receipt to learn the assigned agent id, so a
         * send that reports no hash cannot be treated as success — doing so
         * would lose an identity that may well have been minted.
         */
        throw new Error(
          'The wallet did not return a transaction hash for the registration. ' +
            'Check the wallet before trying again, so a second identity is not minted.',
        );
      }
      return hash;
    },
  };
}
