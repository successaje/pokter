import { escrowMoney } from './presentation';

/**
 * The networks an agent can be hired on, as a card says them.
 *
 * Every agent here is on BNB Chain, so "BNB Chain · real funds" spent half
 * its width on the one word that never changes. The card says the network,
 * Mainnet or Testnet, and keeps what the money means for a tooltip and for
 * screen readers. The colour still tells the two apart at a glance; the
 * word is for anyone who cannot.
 */
export interface HireNetworkTag {
  chainId: number;
  label: 'Mainnet' | 'Testnet';
  real: boolean;
  /** What the money is, in words: the tooltip and the screen-reader text. */
  meaning: string;
}

/**
 * One tag per network a hire can settle on, mainnet first, each at most
 * once. A chain Pokter does not know claims nothing, rather than a guess.
 */
export function hireNetworkTags(chainIds: ReadonlyArray<number | null>): HireNetworkTag[] {
  const seen = new Set<number>();
  const tags: HireNetworkTag[] = [];
  for (const chainId of chainIds) {
    if (chainId === null || seen.has(chainId)) continue;
    seen.add(chainId);
    const money = escrowMoney(chainId);
    if (money.real === null) continue;
    tags.push({
      chainId,
      label: money.real ? 'Mainnet' : 'Testnet',
      real: money.real,
      meaning: money.real ? 'Hired with real funds' : 'Hired with test tokens, which have no value',
    });
  }
  return tags.sort((a, b) => Number(b.real) - Number(a.real));
}

/**
 * The networks an agent can be hired on across its registrations: the one
 * shown, then each other registration's, where it has a verified price
 * (`FindRow.hireChainId`, null without one). A registration alone is not a
 * way to hire: an agent registered on testnet with no price there adds
 * nothing. Mainnet first, each at most once.
 */
export function hireChainIdsOf(shown: number | null, others: ReadonlyArray<number | null>): number[] {
  return hireNetworkTags([shown, ...others]).map((tag) => tag.chainId);
}
