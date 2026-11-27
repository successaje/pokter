'use client';

import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';

import { paymentTokenAt } from '@/lib/network/tokens';
import { walletClient } from '@/lib/wallet/passkey';
import type { SendableToken } from '@/lib/wallet/send-rules';

export interface SendPlan {
  token: SendableToken;
  /** For a token send: which token. Must be one Pokter offers on the chain; native ignores it. */
  tokenAddress?: Address;
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
  /** The network the balance is on. The wallet must act there (`passkeyActsOn`); the page offers only those. */
  chainId: number;
}): Promise<Hex> {
  /*
   * Any token Pokter knows on this network, not only $U: a passkey works
   * only on pokter.xyz, so money paid into it in USDT, USDC or USD1 can
   * leave only through here. Known, not "offered for hiring": a token
   * switched off for hires must still be withdrawable. An address outside
   * the list is refused, not sent: this moves money, and only what it can
   * name.
   */
  const token = input.plan.token === 'native' || !input.plan.tokenAddress ? null : paymentTokenAt(input.chainId, input.plan.tokenAddress);
  if (input.plan.token !== 'native' && !token) throw new Error('That token is not one Pokter knows on this network. Nothing was sent.');
  const call =
    !token
      ? { to: input.plan.to, value: input.plan.amount }
      : {
          to: token.address as Address,
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
    chainId: input.chainId,
  });
  const hash = (outcome as { transactionHash?: Hex }).transactionHash;
  if (!hash) {
    throw new Error(
      'The wallet reported no transaction hash. Check the wallet before sending again.',
    );
  }
  return hash;
}
