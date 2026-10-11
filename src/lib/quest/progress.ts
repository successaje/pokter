/**
 * Set and Earn hire-track progress, from what the chain records.
 *
 * The rule: three different agents, hired across at least two shortlisted
 * marketplaces, counted when the escrow is funded. Funding events carry the
 * buyer and the paid wallet, so different agents can be counted exactly.
 * Which marketplace a hire came from is not recorded by the contract. It is
 * known only when the job's own record says so: Pokter's jobs carry
 * Pokter's envelope, and some other records name a site in their task text
 * ("via example.com"). Everything else is reported as not recorded rather
 * than guessed.
 */

export interface QuestHire {
  chainId: number;
  jobId: string;
  /** Who was paid. */
  provider: string;
  /** The registered agent, when it could be identified. */
  agent: { chainId: number; tokenId: string; name: string | null } | null;
  /** Where the hire was made, as the job's record states it. Null when it does not say. */
  marketplace: string | null;
  status: string;
}

export interface QuestSummary {
  hires: number;
  /** Different agents hired, by registered identity, or by paid wallet when unidentified. */
  distinctAgents: number;
  /** Marketplaces named by the records, Pokter included. */
  namedMarketplaces: string[];
  /** Hires whose records do not say where they were made. */
  unattributed: number;
  agentsMet: boolean;
  /**
   * met: two or more marketplaces are named by the records.
   * likely: one is named and other hires do not say where they were made,
   *   so a second marketplace is possible but not shown.
   * not-met: everything so far points to one marketplace or none.
   */
  marketplaces: 'met' | 'likely' | 'not-met';
}

export const POKTER_MARKETPLACE = 'pokter.xyz';

/** "… via example.com" at the end of a task, as some marketplaces write it. */
export function marketplaceFromTask(task: string): string | null {
  const match = task.match(/\bvia\s+((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i);
  return match ? match[1].toLowerCase() : null;
}

export function summariseQuest(hires: QuestHire[]): QuestSummary {
  const agents = new Set(hires.map((h) => (h.agent ? `agent:${h.agent.chainId}:${h.agent.tokenId}` : `wallet:${h.provider.toLowerCase()}`)));
  const named = [...new Set(hires.map((h) => h.marketplace).filter((m): m is string => m !== null))].sort();
  const unattributed = hires.filter((h) => h.marketplace === null).length;
  const marketplaces = named.length >= 2 ? 'met' : named.length === 1 && unattributed > 0 ? 'likely' : 'not-met';
  return {
    hires: hires.length,
    distinctAgents: agents.size,
    namedMarketplaces: named,
    unattributed,
    agentsMet: agents.size >= 3,
    marketplaces,
  };
}
