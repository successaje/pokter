import { NATIVE_SYMBOL } from '@/lib/network/presentation';

/** Turn wallet/RPC failures into useful, bounded user-facing recovery text. */
export function walletActionError(error: unknown, action: string): string {
  const candidate = error as { shortMessage?: unknown; message?: unknown };
  const raw =
    (typeof candidate?.shortMessage === 'string' && candidate.shortMessage) ||
    (typeof candidate?.message === 'string' && candidate.message) ||
    '';
  const message = raw.trim();

  if (
    /NotAllowedError|user rejected|user denied|rejected the request|cancelled|canceled/i.test(
      message,
    )
  ) {
    return `${action} was cancelled. No transaction was submitted.`;
  }

  if (
    !message ||
    /(?:reason|details):\s*0x(?:\s|$)/i.test(message) ||
    /^(?:error:\s*)?0x$/i.test(message)
  ) {
    return `${action} did not complete. The wallet returned no usable reason. Check the selected network and wallet balance, then try again.`;
  }

  /*
   * The codes the external hire path throws, which nothing used to read.
   *
   * `INSUFFICIENT_PAYMENT_TOKEN` is a single token with no prose in it, so
   * it fell through to the catch-all below and reached the buyer as "no
   * usable reason" — told to somebody whose problem was both specific and
   * fixable from inside the flow. Each of these now says which of the
   * things went wrong, because each means something different about
   * spending money.
   */
  if (/INSUFFICIENT_NATIVE_FOR_SWAP/.test(message)) {
    return `${action} would swap for the missing $U, and this wallet does not hold enough ${NATIVE_SYMBOL} to cover both the swap and the network fee. Top it up from the faucet, or lower the budget.`;
  }

  if (/NO_SWAP_ROUTE/.test(message)) {
    return `${action} needs more $U and there is no pool to buy it from on this network. Get $U from the faucet bot, then try again.`;
  }

  if (/SWAP_REVERTED/.test(message)) {
    return `${action} tried to swap for the missing $U and the swap failed on chain. Nothing was funded into escrow.`;
  }

  if (/INSUFFICIENT_PAYMENT_TOKEN/.test(message)) {
    return `${action} needs more $U than this wallet holds, and the swap did not cover it. Check the balance and try again.`;
  }

  /*
   * This named the passkey wallet to everybody, including the browser
   * wallets that are now the recommended way in — advice pointing at a
   * wallet the reader may not have.
   */
  if (/insufficient funds|exceeds balance|not enough.*(?:bnb|gas)/i.test(message)) {
    return `${action} needs more funds for the value and network fee. Top up the connected wallet, then refresh wallet readiness.`;
  }

  if (/chain mismatch|wrong (?:chain|network)|unsupported chain/i.test(message)) {
    return `${action} is connected to the wrong network. Switch to the hiring network and try again.`;
  }

  /*
   * A thrown name is not an explanation.
   *
   * `ERC8183Error`, a bare selector or any single token with no prose in it
   * tells the reader to go and debug the SDK. Whatever the cause, the useful
   * thing to say is the same: nothing moved, and here is what to check. The
   * raw value still reaches the console for anyone who wants it.
   */
  if (!/\s/.test(message) || /^[\w.]*(?:error|exception)$/i.test(message)) {
    /*
     * No claim here about what did or did not move. This function cannot see
     * how far the caller got, and a reassuring "nothing was transferred" would
     * be false for a failure that follows a completed swap. Callers that do
     * know say so themselves.
     */
    return `${action} did not complete, and the wallet gave no reason we can translate. Check the selected network and wallet balance, then try again.`;
  }

  return message.length > 500 ? `${message.slice(0, 497)}…` : message;
}
