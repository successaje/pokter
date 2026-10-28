import type { Address, Hex } from 'viem';

/** Headroom over the network's estimate, in tenths: 13 is 30% more. */
const GAS_HEADROOM_TENTHS = 13n;

/**
 * The gas limit Pokter asks the wallet to use: the network's estimate for
 * this exact call, with 30% headroom.
 *
 * The limit was left to the wallet. On 27 October 2026 one sent createJob
 * with 900,000 when the call takes about 949,000 (the job stores the signed
 * quote), so creating the job ran out of gas and failed on chain (testnet
 * transaction 0x60758a67…7da2). The buyer's retry worked only because the
 * wallet chose differently the second time. The headroom covers state that
 * moves between the estimate and the block.
 *
 * Left to the wallet, as before, when the estimate itself fails: that
 * means the call would fail now, and the wallet's own check says so with
 * its reason, where a guessed limit would only send it to fail on chain.
 */
export async function gasLimitFor(
  read: { estimateGas(request: { account: Address; to: Address; data: Hex; value?: bigint }): Promise<bigint> },
  request: { account: Address; to: Address; data: Hex; value?: bigint },
): Promise<{ gas?: bigint }> {
  try {
    const estimate = await read.estimateGas(request);
    return { gas: (estimate * GAS_HEADROOM_TENTHS + 9n) / 10n };
  } catch {
    return {};
  }
}

/**
 * Why a sent transaction failed on chain: it ran out of gas, or the
 * contract refused it.
 *
 * Out of gas, a call uses all of its limit or nearly: an inner call that
 * runs out leaves the outer one a 64th to fail with (EIP-150), so "nearly"
 * is 97%. A refusal stops short. The two ask different things of the buyer,
 * and both reached them as "the wallet gave no reason we can translate".
 */
export function failedOnChain(step: string, gasUsed: bigint, gasLimit: bigint | null): string {
  const outOfGas = gasLimit !== null && gasLimit > 0n && gasUsed * 100n >= gasLimit * 97n;
  return `${step.toUpperCase()}_${outOfGas ? 'OUT_OF_GAS' : 'REVERTED'}`;
}
