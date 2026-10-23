import type { Classification } from '@/lib/agents/categories';

/**
 * Which board a visitor is reading.
 *
 * Two boards, never one. Mainnet $U is money and testnet $U is not, so a
 * merged standing would describe neither — the same reason
 * `/api/v1/activity` reports `byChain` and never a sum. Averaging the two
 * would be worse again: it would let a hundred free testnet settlements
 * outrank one paid job.
 */
export type BoardNetwork = 'mainnet' | 'testnet';

export const BOARD_NETWORKS: readonly BoardNetwork[] = ['mainnet', 'testnet'];

function chainOf(network: BoardNetwork): 56 | 97 {
  return network === 'mainnet' ? 56 : 97;
}

/**
 * The escrow chain a board's money settled on.
 *
 * The outcomes view splits here and not on the agent's registry chain,
 * because the question it answers is whether real money changed hands. An
 * agent registered on mainnet can be hired on the testnet escrow and often
 * is — Brinkwatch (56/374107) delivers from its testnet registration — so
 * splitting outcomes on the registry chain would file a free testnet
 * settlement under "BNB Chain" and call test tokens money.
 */
export function escrowChainOf(network: BoardNetwork): 56 | 97 {
  return chainOf(network);
}

/**
 * The registry chain a responsiveness board reads.
 *
 * The same two numbers as `escrowChainOf`, under a second name on purpose:
 * the two views split on different facts and the call site has to say which
 * one it means. A probe is a call to the agent's own endpoint with no
 * escrow in it, and probe rows are keyed by the registration that was
 * called, so the registry chain is the only split the stored data supports.
 * One function named for both would hide that the page is making two
 * different claims, and the page states which it is making on each view.
 */
export function registryChainOf(network: BoardNetwork): 56 | 97 {
  return chainOf(network);
}

export function boardNetworkFrom(raw: string | string[] | undefined): BoardNetwork {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'testnet' ? 'testnet' : 'mainnet';
}

/** The identity a row is about: one ERC-8004 registration. */
export interface BoardAgent {
  /** `chainId:tokenId`, the key every other Pokter surface uses. */
  key: string;
  /** The ERC-8004 registry chain, not the escrow chain. */
  chainId: number;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  category: Classification;
  /** The registered owner, lower-cased. Used to spot a buyer who runs a listed agent. */
  owner: string | null;
}

/**
 * A view that either has figures or does not.
 *
 * The third state is the point. A read that succeeded and matched nothing
 * and a read that failed are different facts, and collapsing them prints a
 * zero — or an empty board — as though Pokter had looked and found nothing.
 * `unavailable` exists so that no caller can publish that by accident.
 */
export type BoardResult<T> =
  | { state: 'ready'; data: T }
  | { state: 'unavailable'; reason: string };

/** What a failed or timed-out read says. Never a zero, never an empty board. */
export const DATA_UNAVAILABLE = 'Data unavailable';

/**
 * What a successful read with nothing in it says, word for word.
 *
 * Fixed as a constant because the wording *is* the claim, and two
 * neighbouring wordings would be two different claims. "No agents yet"
 * would be a statement about the marketplace, and "nobody has paid an
 * agent" a statement about the chain; neither is established. This is a
 * statement about one network, one period and what Pokter has indexed,
 * which is all the query establishes.
 */
export const NO_QUALIFYING_SETTLEMENTS =
  'No qualifying external settlements found in the indexed data for this network and period.';
