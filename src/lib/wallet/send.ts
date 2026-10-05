'use client';

import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import type { SendableToken } from '@/lib/wallet/send-rules';

export interface SendPlan {
  token: SendableToken;
  to: Address;
  /** Raw units of the token being sent. */
  amount: bigint;
}

/**
 * Move tokens out of a passkey wallet.
 *
 * One call either way: a native send is value with no data, and a token
 * send is an ERC-20 transfer. Both go through the same execute path the
 * hire and publish flows use, so there is one place where this wallet
 * signs anything.
 */
export async function sendFromPasskey(input: {
  wallet: { address: Address };
  signer: unknown;
  plan: SendPlan;
}): Promise<Hex> {
  const { paymentToken } = correctedErc8183Addresses(WALLET_NETWORK.chainId);
  const call =
    input.plan.token === 'native'
      ? { to: input.plan.to, value: input.plan.amount }
      : {
          to: paymentToken as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [input.plan.to, input.plan.amount],
          }),
        };

  const outcome = await walletClient().execute({
    wallet: { address: input.wallet.address },
    signer: input.signer as never,
    calls: [call],
    chainId: WALLET_NETWORK.chainId,
  });
  const hash = (outcome as { transactionHash?: Hex }).transactionHash;
  if (!hash) {
    throw new Error(
      'The wallet reported no transaction hash. Check the wallet before sending again.',
    );
  }
  return hash;
}
