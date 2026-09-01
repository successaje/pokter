import 'server-only';

import {
  createClient,
  signerFromPrivateKey,
  BNB,
  BNB_TESTNET,
} from '@altananetwork/sdk';

/**
 * Altana client wiring.
 *
 * Pokter runs against BSC testnet by default. Altana's testnet is a complete
 * standalone stack — keystore, account contracts and relay all on chain 97 — so
 * a session granted here is genuinely registered on-chain and genuinely
 * revocable, not simulated. Every surface that displays a session says which
 * network it came from (§39): testnet and mainnet are never blurred together.
 */
export const ALTANA_NETWORK =
  process.env.ALTANA_NETWORK === 'bnb' ? BNB : BNB_TESTNET;

export const IS_TESTNET = ALTANA_NETWORK.chainId === 97;

export class AltanaNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AltanaNotConfiguredError';
  }
}

/**
 * The admin signer controlling the demo wallet.
 *
 * For the hackathon this is a Pokter-operated key holding only testnet funds.
 * The user-wallet path is the same call with the user's own signer — custody
 * follows the signer in Altana's model, and Altana never persists keys.
 */
export function adminSigner() {
  const key = process.env.ALTANA_ADMIN_KEY;

  if (!key || !key.startsWith('0x')) {
    throw new AltanaNotConfiguredError(
      'ALTANA_ADMIN_KEY is not set. Generate a testnet key and fund it before granting sessions.',
    );
  }

  if (!IS_TESTNET && process.env.ALTANA_ALLOW_MAINNET !== 'true') {
    // A key generated for a testnet demo must never sign mainnet value by
    // accident; opting in has to be deliberate.
    throw new AltanaNotConfiguredError(
      'Refusing to use the demo admin key on mainnet. Set ALTANA_ALLOW_MAINNET=true only with a key you intend to use there.',
    );
  }

  return signerFromPrivateKey(key as `0x${string}`);
}

export function altanaClient() {
  return createClient({ chains: [ALTANA_NETWORK] });
}

/** Explorer link for a transaction on the configured network. */
export function explorerTx(hash: string): string {
  return `${ALTANA_NETWORK.explorer.replace(/\/$/, '')}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${ALTANA_NETWORK.explorer.replace(/\/$/, '')}/address/${address}`;
}
