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

  if (/insufficient funds|exceeds balance|not enough.*(?:bnb|gas)/i.test(message)) {
    return `${action} needs more funds for the value and network fee. Refresh wallet readiness after funding the passkey wallet.`;
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
