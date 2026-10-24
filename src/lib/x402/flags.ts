/**
 * Pay-per-call over x402 is off unless the operator turns it on.
 *
 * `NEXT_PUBLIC_` because the agent page needs to know whether to offer it;
 * read through a parser with a safe default, as `enabledEscrowChains` is.
 * Anything but the exact word "true" is off.
 */
export function x402Enabled(raw: string | undefined = process.env.NEXT_PUBLIC_X402_ENABLED): boolean {
  return raw?.trim() === 'true';
}

/** What every x402 route answers while it is off. */
export const X402_DISABLED = { error: 'Pay-per-call (x402) is not enabled on this Pokter.' } as const;
