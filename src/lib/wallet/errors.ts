import { NATIVE_SYMBOL } from '@/lib/network/presentation';

/** Turn wallet/RPC failures into useful, bounded user-facing recovery text. */
/**
 * The part of a viem error that says which call failed.
 *
 * viem's `shortMessage` is written for a reader — "Invalid parameters
 * were provided to the RPC method" — and the method, the arguments and
 * the chain all live in `details` and `metaMessages` beside it. Showing
 * only the short message produced a report nobody could act on, mine
 * included: a mainnet hire failed with exactly that sentence and
 * nothing in it named the request that was rejected.
 *
 * Trimmed hard, because this is appended to a message a buyer reads.
 * Enough to identify the call, not a stack trace.
 */
function rpcDetail(error: unknown): string | null {
  const candidate = error as {
    details?: unknown;
    metaMessages?: unknown;
    cause?: { details?: unknown; metaMessages?: unknown };
  };
  const parts: string[] = [];
  for (const source of [candidate, candidate?.cause]) {
    if (typeof source?.details === 'string') parts.push(source.details);
    if (Array.isArray(source?.metaMessages)) {
      parts.push(
        ...source.metaMessages.filter(
          (line): line is string => typeof line === 'string' && /method|chain|args/i.test(line),
        ),
      );
    }
  }
  const detail = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ')
    .replace(/\s+/g, ' ')
    .slice(0, 220);
  return detail || null;
}

export function walletActionError(error: unknown, action: string): string {
  const candidate = error as { shortMessage?: unknown; message?: unknown };
  const raw =
    (typeof candidate?.shortMessage === 'string' && candidate.shortMessage) ||
    (typeof candidate?.message === 'string' && candidate.message) ||
    '';
  const message = raw.trim();

  // The wallet holds one prompt at a time; a second is refused until the first is answered.
  if (/already pending|-32002/i.test(message)) {
    return `${action} is waiting on an earlier request in your wallet. Open the wallet (the extension icon in your browser toolbar), approve or reject what is there, then try again.`;
  }

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

  /*
   * The wallet returned a hash and the network never saw the
   * transaction. Distinguished from a slow confirmation because the two
   * call for opposite responses: wait, or try again.
   */
  if (/SUBMIT_NOT_BROADCAST/.test(message)) {
    return `${action} was signed, but the network has no record of the transaction — it was never broadcast. Nothing was sent and no fee was paid. Try again.`;
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

  /*
   * The failing call, appended for the messages that are otherwise
   * untraceable. A wallet saying "invalid parameters" without naming the
   * request leaves the reader, and whoever they report it to, with
   * nothing to go on.
   */
  const detail = rpcDetail(error);
  const full = detail && !message.includes(detail) ? `${message} (${detail})` : message;
  return full.length > 500 ? `${full.slice(0, 497)}…` : full;
}

/**
 * Why a wallet did not connect, in words a buyer can act on.
 *
 * The common case reached people as MetaMask's raw text: "Request of type
 * 'wallet_requestPermissions' already pending for origin https://pokter.xyz.
 * Please wait." It means an earlier connection prompt is still open in the
 * wallet, often behind the browser window, and the wallet refuses a second
 * until that one is answered. Clicking Connect again cannot fix it; opening
 * the wallet can.
 */
export function connectErrorMessage(raw: string): string {
  if (/already pending|-32002|resource not available|request already/i.test(raw)) {
    return 'Your wallet already has a connection request waiting. Open the wallet (the extension icon in your browser toolbar) and approve or reject it, then connect again.';
  }
  if (/reject|denied|cancel/i.test(raw)) {
    return 'The request was declined in the wallet. Nothing was shared; try again when ready.';
  }
  if (/no (?:injected|ethereum) provider|provider not found|connector not found/i.test(raw)) {
    return 'No browser wallet was found. Install one, such as MetaMask, or use the wallet app or passkey options above.';
  }
  return raw.split('\n')[0].slice(0, 240);
}
