import 'server-only';

import { assertNetworkAgreement } from '@/lib/network/presentation';

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
/**
 * What an operator signature is for.
 *
 * Every current use is a demo path: the legacy server-side session and hire
 * endpoints, and the testnet seller. Real users sign for themselves with a
 * passkey, so none of these should be reachable on mainnet without somebody
 * deciding so on purpose, one purpose at a time.
 */
export type OperatorPurpose = 'legacy-session' | 'legacy-hire' | 'demo-seller' | 'gas-sponsor';

/**
 * Mainnet purposes that have been deliberately permitted.
 *
 * POK-009. This replaced a single `ALTANA_ALLOW_MAINNET=true`, which unlocked
 * every operator-signed path at once — so enabling one legitimate use quietly
 * re-armed the other two. Now the variable names what it opens, and anything
 * unnamed stays shut.
 *
 *   ALTANA_MAINNET_OPERATOR_PURPOSES=legacy-hire
 */
function permittedOnMainnet(): Set<string> {
  return new Set(
    (process.env.ALTANA_MAINNET_OPERATOR_PURPOSES ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function adminSigner(purpose: OperatorPurpose) {
  // Before anything signs, confirm the interface is describing the same chain
  // the signature will land on. See assertNetworkAgreement for why the two can
  // drift apart.
  assertNetworkAgreement();

  const key = process.env.ALTANA_ADMIN_KEY;

  if (!key || !key.startsWith('0x')) {
    throw new AltanaNotConfiguredError(
      'ALTANA_ADMIN_KEY is not set. Generate a testnet key and fund it before granting sessions.',
    );
  }

  if (!IS_TESTNET && !permittedOnMainnet().has(purpose)) {
    // A key generated for a testnet demo must never sign mainnet value by
    // accident, and opting in should admit exactly one thing at a time.
    throw new AltanaNotConfiguredError(
      `Refusing to sign '${purpose}' with the operator key on mainnet. ` +
        `Every operator path is a demo path; real users sign with a passkey. ` +
        `If this one is genuinely needed, add it to ` +
        `ALTANA_MAINNET_OPERATOR_PURPOSES with a key intended for mainnet.`,
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
