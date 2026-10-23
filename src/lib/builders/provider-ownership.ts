import type { Address } from 'viem';

/**
 * Which of a wallet's candidate agents the registry still names it the
 * owner of — the decision, with the registry read injected.
 *
 * `provider-identity.ts` is `server-only`: it reaches an RPC endpoint and a
 * SQLite file, so nothing in `tests/` can load it. The decision this module
 * makes is the one worth proving, and the property being proved is that it
 * **fails closed**: an agent whose ownership could not be read is dropped
 * from the fleet and named, never carried through on the catalogue's or a
 * signature's word.
 *
 * The defect this exists to prevent, which shipped: the four read tools
 * (`provider_status`, `find_requests`, `list_work`, `report_earnings`) never
 * confirmed ownership at all. They took `providerFleet`, which is the union
 * of the indexer catalogue and the verified-publishers table, and matched
 * jobs on `agentChainId:agentTokenId` alone. A wallet that had verified an
 * agent, minted a ninety-day token and then transferred the agent away kept
 * reading the new owner's funded briefs, their budgets, their deliverable
 * URLs and their earnings — the signature table has no TTL, so its row
 * answered forever, and nothing downstream asked the registry.
 *
 * `job.provider` is not the filter. It is the agent's registered wallet as
 * the catalogue reported it at hire time, which is frequently not the
 * wallet that owns the ERC-8004 token, so filtering on it would hide a
 * legitimate owner's own jobs. Ownership is decided where ownership is
 * decided.
 */

export type OwnerConfirmation =
  | { ok: true; owner: Address }
  | { ok: false; unavailable: true; reason: string }
  | { ok: false; unavailable: false; reason: string };

export interface OwnedCandidate {
  chainId: number;
  tokenId: string;
}

export interface ConfirmedFleet<T extends OwnedCandidate> {
  /** The candidates the registry names this wallet the owner of, right now. */
  agents: T[];
  /**
   * `chainId:tokenId` whose ownership could not be read.
   *
   * Named rather than swallowed. These agents are dropped, so their jobs
   * and earnings are withheld — and a withheld job that is reported as no
   * job is "you have nothing outstanding", which is a false claim about
   * somebody's money. Every caller says which agents it could not check.
   */
  ownershipUnavailable: string[];
  /** `chainId:tokenId` the registry no longer names this wallet the owner of. */
  notOwned: string[];
}

/** `chainId:tokenId`, the one spelling of an identity used everywhere. */
export const agentKey = (agent: OwnedCandidate) => `${agent.chainId}:${agent.tokenId}`;

/**
 * Keep only the agents a registry read confirms, and say what happened to
 * the rest.
 *
 * `confirm` is injected so this is testable and so there is one place the
 * posture lives: a read that throws is the same as a read that answered
 * "unavailable", and both drop the agent. Reads run in parallel because a
 * fleet is a handful of identities and a tool call has a deadline.
 */
export async function confirmOwnedAgents<T extends OwnedCandidate>(
  candidates: readonly T[],
  confirm: (chainId: number, tokenId: string) => Promise<OwnerConfirmation>,
): Promise<ConfirmedFleet<T>> {
  const checked = await Promise.all(
    candidates.map(async (agent) => ({
      agent,
      /* A thrown read is not a confirmation. Treated as "could not check"
         rather than allowed to reject the whole call, so one sick RPC
         endpoint withholds one agent's jobs and not every agent's. */
      confirmation: await confirm(agent.chainId, agent.tokenId).catch(
        (): OwnerConfirmation => ({ ok: false, unavailable: true, reason: 'The ownership check did not complete.' }),
      ),
    })),
  );
  const agents: T[] = [];
  const ownershipUnavailable: string[] = [];
  const notOwned: string[] = [];
  for (const { agent, confirmation } of checked) {
    if (confirmation.ok) agents.push(agent);
    else if (confirmation.unavailable) ownershipUnavailable.push(agentKey(agent));
    else notOwned.push(agentKey(agent));
  }
  return { agents, ownershipUnavailable, notOwned };
}

/**
 * What a tool says when it could not check every agent it was asked about.
 *
 * One sentence, in one place, so `provider_status`, `list_work` and
 * `report_earnings` cannot come to describe the same outage differently —
 * and so that none of them can report a withheld job as no job.
 */
export function ownershipUnavailableNote(keys: readonly string[]): string {
  return (
    `Pokter could not confirm ownership of ${keys.join(', ')} against the ERC-8004 registry just now, so anything ` +
    'belonging to those agents is withheld from this answer rather than shown on a stale record. This is Pokter ' +
    'failing to read the registry, not an answer about what this wallet owns or is owed. Retry shortly.'
  );
}

/** What a tool says about an agent this wallet no longer owns. */
export function notOwnedNote(keys: readonly string[]): string {
  return (
    `The ERC-8004 registry no longer names this wallet as the owner of ${keys.join(', ')}, so its requests, jobs and ` +
    'earnings are not this wallet’s to read and are not in this answer. Ownership is read from the registry on every ' +
    'call; a past verification signature does not carry it over a transfer.'
  );
}
