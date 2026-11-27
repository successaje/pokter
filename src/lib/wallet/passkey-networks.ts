import { CHAIN_ID } from '@/lib/network/presentation';

/*
 * Which networks a passkey wallet is set up on, and which it may act on.
 *
 * Altana makes a passkey wallet's address from a one-time key, sets the
 * wallet up on every network its client names at creation, then discards
 * that key. A network left out at creation can never be added: the address
 * exists there, but nothing can sign its setup. So the networks are a fact
 * about each wallet, recorded when it is made, not a setting of the site.
 *
 * Two settings, both defaulting to the build's one passkey network
 * (`NEXT_PUBLIC_ALTANA_NETWORK`), so an unset deployment behaves exactly as
 * before:
 *
 * - `NEXT_PUBLIC_PASSKEY_SETUP_CHAINS`: the networks a NEW wallet is set up
 *   on. "97,56" gives one passkey one address on both, ready for mainnet
 *   before mainnet is opened. Nothing is paid on a network until the wallet
 *   first acts there.
 * - `NEXT_PUBLIC_PASSKEY_CHAINS`: the networks a passkey may act on at all.
 *   Mainnet joins this only when passkeys are opened there on purpose.
 *
 * A wallet acts on a network only when both agree: it was set up there, and
 * the site has opened it.
 */

export type PasskeyChainId = 56 | 97;

const isPasskeyChain = (id: number): id is PasskeyChainId => id === 56 || id === 97;

/** The build's one passkey network, which every wallet made before this was set up on. */
export const LEGACY_PASSKEY_CHAIN: PasskeyChainId = CHAIN_ID === 56 ? 56 : 97;

/**
 * A list of networks from a setting: known networks only, each once, the
 * legacy network first (it is the client's default and where existing
 * wallets live). Unset, empty or unreadable means the legacy network alone.
 */
export function parsePasskeyChains(raw: string | undefined, legacy: PasskeyChainId = LEGACY_PASSKEY_CHAIN): PasskeyChainId[] {
  const listed = (raw ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter(isPasskeyChain);
  const unique = [...new Set(listed)];
  if (!unique.length) return [legacy];
  return unique.includes(legacy) ? [legacy, ...unique.filter((id) => id !== legacy)] : unique;
}

/** The networks a new passkey wallet is set up on. */
export const PASSKEY_SETUP_CHAINS = parsePasskeyChains(process.env.NEXT_PUBLIC_PASSKEY_SETUP_CHAINS);

/** The networks a passkey wallet may act on, on this site. */
export const PASSKEY_ACTION_CHAINS = parsePasskeyChains(process.env.NEXT_PUBLIC_PASSKEY_CHAINS);

/**
 * The networks a stored wallet was set up on.
 *
 * A record written before networks were recorded has none: it was made by a
 * client that named the legacy network alone, so that is what it has. A
 * record naming no known network is treated the same way rather than as a
 * wallet that acts nowhere.
 */
export function storedPasskeyChains(chains: unknown, legacy: PasskeyChainId = LEGACY_PASSKEY_CHAIN): PasskeyChainId[] {
  if (!Array.isArray(chains)) return [legacy];
  const known = [...new Set(chains.filter((id): id is PasskeyChainId => typeof id === 'number' && isPasskeyChain(id)))];
  return known.length ? known : [legacy];
}

/**
 * Whether this passkey wallet can act on a network: it was set up there and
 * the site has opened passkeys there. False with no wallet.
 */
export function passkeyActsOn(
  wallet: { chains: readonly number[] } | null | undefined,
  chainId: number,
  open: readonly number[] = PASSKEY_ACTION_CHAINS,
): boolean {
  return Boolean(wallet) && wallet!.chains.includes(chainId) && open.includes(chainId);
}

/** The networks this wallet can act on now, in the order recorded. */
export function passkeyActionChains(
  wallet: { chains: readonly number[] } | null | undefined,
  open: readonly number[] = PASSKEY_ACTION_CHAINS,
): PasskeyChainId[] {
  if (!wallet) return [];
  return wallet.chains.filter((id): id is PasskeyChainId => isPasskeyChain(id) && open.includes(id));
}
