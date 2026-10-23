import 'server-only';

import { getAddress, type Address } from 'viem';

import { classify } from '@/lib/agents/categories';
import { registryOwner } from '@/lib/registry/onchain';
import { listAgents } from '@/lib/scan/client';
import type { ScanAgent } from '@/lib/scan/types';

import {
  confirmOwnedAgents,
  type OwnerConfirmation,
} from './provider-ownership';
import { verifiedPublisherByOwner } from './store';

/**
 * Which agents an automation token's wallet may act for, and read for.
 *
 * Candidates come from two sources, because each fails where the other
 * works. The catalogue knows an agent's name and category, which is what
 * matching a request needs, and it is the source the browser pages already
 * use. The verified publishers table knows only an identity, but it knows
 * it from a signature this wallet produced, so it still answers when the
 * indexer is down — and an assistant told "you own no agents" during an
 * indexer outage would conclude there was nothing to do. That table now
 * expires its rows; see `publisher-store.ts` for how long and why.
 *
 * Neither source authorises anything. Every candidate is confirmed against
 * the ERC-8004 registry before it is returned, for the same reason
 * `/api/builders/deliveries` does it per request: an agent transferred away
 * must stop being readable and actionable at once, and a stale catalogue row
 * or an old signature must not hand it to the previous owner.
 *
 * That confirmation used to be the *acting* tools' job alone —
 * `confirmAgentOwner` was reached only from `prepare_proposal` and
 * `prepare_deliverable`. The four read tools took this fleet unchecked and
 * matched jobs on `agentChainId:agentTokenId` with no owner filter, so a
 * former owner's ninety-day token kept reading a new owner's funded briefs,
 * budgets, deliverable URLs and earnings. The check belongs here, where
 * every caller gets it, rather than in the tools that remembered.
 */

export interface ProviderAgent {
  chainId: number;
  tokenId: string;
  /** From the catalogue; null when only the signature record was available. */
  name: string | null;
  /** The category the agent is listed under, which is what a request is matched on. */
  categoryId: string | null;
  /** When this wallet last proved ownership by signature, where it has. */
  provedAt: string | null;
}

export interface ProviderFleet {
  /** Only the agents the registry names this wallet the owner of, right now. */
  agents: ProviderAgent[];
  /**
   * The registry chains whose catalogue could not be read.
   *
   * Named rather than swallowed: without the catalogue there is no category
   * for an agent, so request matching cannot be applied and the tools say
   * that instead of reporting "no matching requests", which would be the
   * same answer as there being none.
   */
  catalogueUnavailable: number[];
  /**
   * `chainId:tokenId` whose ownership could not be confirmed.
   *
   * These are withheld, so every surface that reports jobs or money has to
   * say so: a withheld job reported as no job is "you have nothing
   * outstanding", which is a false claim about somebody's work.
   */
  ownershipUnavailable: string[];
  /** `chainId:tokenId` the registry no longer names this wallet the owner of. */
  notOwned: string[];
}

/** At most this many agents are carried, so one wallet's fleet cannot make a tool call unbounded. */
const MAX_AGENTS = 25;

export async function providerFleet(ownerAddress: string): Promise<ProviderFleet> {
  /* Normalised once, here, because the two sources below disagree about
     spelling: the catalogue matches an address as given, and the signature
     records are stored lower-cased. A checksummed and an unchecksummed
     spelling of one wallet are one wallet. */
  const owner = getAddress(ownerAddress);
  const catalogueUnavailable: number[] = [];
  const pages = await Promise.all(
    ([56, 97] as const).map((chainId) =>
      listAgents({ chainId, ownerAddress: owner, limit: 100 }).catch(() => {
        catalogueUnavailable.push(chainId);
        return { items: [] as ScanAgent[] };
      }),
    ),
  );
  const proved = new Map<string, string>(
    verifiedPublisherByOwner(owner).map((p) => [`${p.chainId}:${p.tokenId}`, p.verifiedAt]),
  );
  const found = new Map<string, ProviderAgent>();
  for (const agent of pages.flatMap((p) => p.items)) {
    const key = `${agent.chain_id}:${agent.token_id}`;
    const category = classify(agent);
    found.set(key, {
      chainId: agent.chain_id,
      tokenId: agent.token_id,
      name: agent.name,
      /* `classify` answers `unclassified` for an agent that fits none of
         Pokter's categories. A request is matched on a category both sides
         claimed, so "unclassified" is no category rather than one. */
      categoryId: category === 'unclassified' ? null : category,
      provedAt: proved.get(key) ?? null,
    });
  }
  for (const [key, verifiedAt] of proved) {
    if (found.has(key)) continue;
    const [chainId, tokenId] = key.split(':');
    found.set(key, { chainId: Number(chainId), tokenId, name: null, categoryId: null, provedAt: verifiedAt });
  }
  /* Confirmed after the cap, not before, so one wallet's fleet cannot make
     this an unbounded fan-out of RPC calls either. */
  const candidates = [...found.values()].slice(0, MAX_AGENTS);
  const confirmed = await confirmOwnedAgents(candidates, (chainId, tokenId) =>
    confirmAgentOwner(owner, chainId, tokenId),
  );
  return {
    agents: confirmed.agents,
    catalogueUnavailable: catalogueUnavailable.sort(),
    ownershipUnavailable: confirmed.ownershipUnavailable,
    notOwned: confirmed.notOwned,
  };
}

export type { OwnerConfirmation };

/**
 * Whether the registry names this wallet as the agent's owner, right now.
 *
 * Read from the registry and never from the catalogue, and "could not
 * check" is reported as exactly that rather than as "not yours" — the same
 * posture `/api/builders/deliveries` takes, and for the same reason: an RPC
 * failure must not read as a revoked permission, and a stale index must not
 * read as a live one.
 */
export async function confirmAgentOwner(
  owner: Address,
  chainId: number,
  tokenId: string,
): Promise<OwnerConfirmation> {
  const current = await registryOwner(chainId, tokenId).catch(() => null);
  if (!current) {
    return {
      ok: false,
      unavailable: true,
      reason: `The ERC-8004 registry on chain ${chainId} did not answer, so Pokter cannot confirm that this wallet owns agent ${chainId}:${tokenId}. Nothing was changed; try again shortly.`,
    };
  }
  if (current !== getAddress(owner)) {
    return {
      ok: false,
      unavailable: false,
      reason: `The registry names ${current} as the owner of agent ${chainId}:${tokenId}, not this automation token’s wallet. Only the current owner can offer or deliver for it.`,
    };
  }
  return { ok: true, owner: current };
}
