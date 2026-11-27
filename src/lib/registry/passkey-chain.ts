/**
 * Whether a passkey wallet can publish on a given identity chain.
 *
 * A passkey wallet acts only on the networks it was set up on and the site
 * has opened (`passkeyActionChains`). Learning this inside the SDK,
 * mid-registration, after the first
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
  walletChainIds: readonly number[],
): string | null {
  if (walletChainIds.includes(requestedChainId)) return null;
  const name = (chainId: number) => (chainId === 56 ? 'BNB Chain' : 'BNB Testnet');
  const where = walletChainIds.length ? `on ${walletChainIds.map(name).join(' and ')} only` : 'nowhere on this site yet';
  return (
    `This passkey wallet publishes ${where}. ` +
    `Connect a browser wallet to publish on ${name(requestedChainId)}.`
  );
}
