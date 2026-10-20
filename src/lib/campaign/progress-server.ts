import 'server-only';

import { readAgentAdoption } from '@/lib/builder/adoption-server';
import { registeredInCampaign } from '@/lib/campaign/window';
import { lookupQuest } from '@/lib/quest/lookup';
import { POKTER_MARKETPLACE } from '@/lib/quest/progress';
import { listAgents } from '@/lib/scan/client';

export interface CampaignProgressReport {
  address: string;
  hires: {
    distinctAgents: number;
    total: number;
    marketplaces: string[];
    marketplacesStatus: 'met' | 'likely' | 'not-met';
    unattributed: number;
    recent: Array<{ name: string; marketplace: string | null; chainId: number; jobId: string }>;
  };
  /** The agents this wallet owns now, newest first, each marked whether it was registered inside the window. Null when the registry did not answer. */
  build: Array<{ chainId: number; tokenId: string; name: string; inWindow: boolean | null }> | null;
  /** Adoption of the newest agent registered inside the window, as Builder Studio counts it. */
  adoption: { chainId: number; tokenId: string; name: string; independentWallets: number; actions: number; activeDays: number; actionsBlockedReason: string | null } | null;
}

/**
 * Everything the Set and Earn page can show for one wallet, from public
 * sources only: escrow hires (the same reading as /quest), the registry's
 * list of agents it owns, and Studio's adoption count for the newest one
 * registered in the window. Registration with BNB Chain is not among them:
 * Pokter cannot see BNB Chain's form, so the page asks.
 */
export async function campaignProgress(address: string): Promise<CampaignProgressReport> {
  const [quest, ...pages] = await Promise.all([
    lookupQuest(address),
    ...[56, 97].map((chainId) => listAgents({ chainId: chainId as 56 | 97, ownerAddress: address, limit: 50 }).catch(() => null)),
  ]);
  const owned = pages.some((page) => page === null)
    ? null
    : pages
        .flatMap((page) => page?.items ?? [])
        .map((a) => ({ chainId: a.chain_id, tokenId: a.token_id, name: a.name || `Agent #${a.token_id}`, inWindow: registeredInCampaign(a.created_at), createdAt: a.created_at }))
        .sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
  const candidate = owned?.find((a) => a.inWindow === true) ?? null;
  const adoption = candidate ? await readAgentAdoption(candidate.chainId, candidate.tokenId, [address]).catch(() => null) : null;

  return {
    address,
    hires: {
      distinctAgents: quest.summary.distinctAgents,
      total: quest.summary.hires,
      marketplaces: quest.summary.namedMarketplaces.map((m) => (m === POKTER_MARKETPLACE ? 'Pokter' : m)),
      marketplacesStatus: quest.summary.marketplaces,
      unattributed: quest.summary.unattributed,
      recent: quest.hires.slice(0, 6).map((h) => ({ name: h.agent?.name ?? `${h.provider.slice(0, 6)}…${h.provider.slice(-4)}`, marketplace: h.marketplace === POKTER_MARKETPLACE ? 'Pokter' : h.marketplace, chainId: h.chainId, jobId: h.jobId })),
    },
    build: owned ? owned.map((a) => ({ chainId: a.chainId, tokenId: a.tokenId, name: a.name, inWindow: a.inWindow })) : null,
    adoption:
      candidate && adoption
        ? { chainId: candidate.chainId, tokenId: candidate.tokenId, name: candidate.name, independentWallets: adoption.independentWallets, actions: adoption.actions, activeDays: adoption.activeDays, actionsBlockedReason: adoption.actionsBlockedReason }
        : null,
  };
}
