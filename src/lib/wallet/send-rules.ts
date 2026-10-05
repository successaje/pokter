import { isAddress, parseEther, parseUnits } from 'viem';

export type SendableToken = 'native' | 'payment';

/**
 * Held back from a native send so the wallet can still sign afterwards.
 *
 * Gas on this chain is the same asset somebody may legitimately want to
 * move, so the reserve is a floor rather than a ban: send what you like
 * down to the point where the wallet could no longer pay to send anything
 * again. A wallet emptied of gas cannot transfer its own tokens out, and
 * the only remedy is for somebody else to fund it.
 */
export const GAS_RESERVE = parseEther('0.001');

/**
 * What is wrong with a proposed send, or nothing.
 *
 * Returns the sentence to show rather than a boolean, because every one of
 * these is a different mistake and "invalid" tells somebody none of them.
 * Takes the token symbols rather than importing them, so the rules about
 * somebody's money can be tested without the wallet stack.
 */
export function describeSendProblem(input: {
  token: SendableToken;
  to: string;
  amount: bigint;
  nativeBalance: bigint;
  paymentBalance: bigint;
  nativeSymbol: string;
  paymentSymbol: string;
}): string | null {
  const symbol = input.token === 'native' ? input.nativeSymbol : input.paymentSymbol;
  if (!input.to.trim()) return 'Enter the address to send to.';
  if (!isAddress(input.to)) return 'That is not a valid address.';
  if (input.amount <= 0n) return 'Enter an amount greater than zero.';

  if (input.token === 'payment') {
    if (input.amount > input.paymentBalance) {
      return `This wallet holds less than that in ${symbol}.`;
    }
    if (input.nativeBalance < GAS_RESERVE) {
      return `Sending needs gas, and this wallet has almost no ${input.nativeSymbol}.`;
    }
    return null;
  }

  if (input.amount > input.nativeBalance) {
    return `This wallet holds less than that in ${symbol}.`;
  }
  if (input.nativeBalance - input.amount < GAS_RESERVE) {
    return (
      `Keep at least ${Number(GAS_RESERVE) / 1e18} ${input.nativeSymbol} for gas. ` +
      `A wallet with none cannot send anything again, including this.`
    );
  }
  return null;
}

/** The largest amount that may be sent, after the gas the wallet must keep. */
export function sendableNative(nativeBalance: bigint): bigint {
  return nativeBalance > GAS_RESERVE ? nativeBalance - GAS_RESERVE : 0n;
}

export function parseAmount(value: string): bigint {
  try {
    return parseUnits(value.trim() || '0', 18);
  } catch {
    return 0n;
  }
}
