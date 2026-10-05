/**
 * Whether a passkey wallet can publish on a given identity chain.
 *
 * The passkey client is built for one network and can only sign for that
 * one. Learning this inside the SDK, mid-registration, after the first
 * transaction has already minted an identity, is the expensive way to find
 * out — so it is decided here, before anything is signed, and returned as
 * the sentence to show rather than a bare false.
 *
 * Separate from the signer because the signer imports the wallet stack,
 * which does not resolve under the test runner, and this is the part worth
 * pinning.
 */
export function passkeyChainRefusal(
  requestedChainId: number,
  walletChainId: number,
): string | null {
  if (requestedChainId === walletChainId) return null;
  const name = (chainId: number) => (chainId === 56 ? 'BNB Chain' : 'BNB Testnet');
  return (
    `A passkey wallet publishes on ${name(walletChainId)} only. ` +
    `Connect a browser wallet to publish on ${name(requestedChainId)}.`
  );
}
