/**
 * How the active network is described to a user.
 *
 * Deliberately not `server-only` and not `'use client'`: the same values have
 * to reach a server component rendering a receipt link and a client component
 * labelling a balance. One source means the two cannot disagree.
 *
 * Everything here derives from `NEXT_PUBLIC_ALTANA_NETWORK`, because the
 * browser has to be able to read it. `assertNetworkAgreement` checks that the
 * server's own `ALTANA_NETWORK` says the same thing — see the note there for
 * why that check exists.
 */

export const IS_TESTNET = process.env.NEXT_PUBLIC_ALTANA_NETWORK !== 'bnb';

export const CHAIN_ID = IS_TESTNET ? 97 : 56;

/** What the user is actually spending. Never hardcode this. */
export const NATIVE_SYMBOL = IS_TESTNET ? 'tBNB' : 'BNB';

export const NETWORK_LABEL = IS_TESTNET ? 'BSC testnet' : 'BSC mainnet';

const EXPLORER = IS_TESTNET
  ? 'https://testnet.bscscan.com'
  : 'https://bscscan.com';

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER}/address/${address}`;
}

/**
 * Where a user can obtain funds, or null when they cannot simply be given.
 *
 * Null on mainnet is the point. Offering a faucet for a chain that has none
 * tells someone their funds are free, which is the most direct way to have
 * them authorise real money believing it is play money.
 */
export const FAUCETS: { native: string; paymentToken: string } | null =
  IS_TESTNET
    ? {
        native: 'https://www.bnbchain.org/en/testnet-faucet',
        paymentToken: 'https://united-coin-u.github.io/u-faucet/',
      }
    : null;

/**
 * Fail loudly when the server and the browser disagree about the network.
 *
 * `ALTANA_NETWORK` decides what the server signs; `NEXT_PUBLIC_ALTANA_NETWORK`
 * decides what the interface says. They are separate variables, and today they
 * agree only because both are unset and default to testnet. Setting one at
 * migration and not the other produces the worst available outcome: real
 * mainnet transactions described to the user as testnet.
 *
 * Server-side callers only — the browser cannot see `ALTANA_NETWORK`.
 */
export function assertNetworkAgreement(): void {
  const serverIsTestnet = process.env.ALTANA_NETWORK !== 'bnb';
  if (serverIsTestnet !== IS_TESTNET) {
    throw new Error(
      `Network mismatch: the server signs on ${serverIsTestnet ? 'testnet' : 'mainnet'} ` +
        `while the interface says ${IS_TESTNET ? 'testnet' : 'mainnet'}. ` +
        'Set ALTANA_NETWORK and NEXT_PUBLIC_ALTANA_NETWORK to the same value.',
    );
  }
}
