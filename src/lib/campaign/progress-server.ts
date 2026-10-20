import 'server-only';

import { readAgentAdoption } from '@/lib/builder/adoption-server';
import { registeredInCampaign } from '@/lib/campaign/window';
import { lookupQuest } from '@/lib/quest/lookup';
import { getJobStore } from '@/lib/erc8183/store';
import { POKTER_MARKETPLACE, summariseQuest, type QuestHire } from '@/lib/quest/progress';
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
  const { hires, summary } = await campaignHires(address, quest.hires);
  const candidate = owned?.find((a) => a.inWindow === true) ?? null;
  const adoption = candidate ? await readAgentAdoption(candidate.chainId, candidate.tokenId, [address]).catch(() => null) : null;

  return {
    address,
    hires: {
      distinctAgents: summary.distinctAgents,
      total: summary.hires,
      marketplaces: summary.namedMarketplaces.map((m) => (m === POKTER_MARKETPLACE ? 'Pokter' : m)),
      marketplacesStatus: summary.marketplaces,
      unattributed: summary.unattributed,
      recent: hires.slice(0, 6).map((h) => ({ name: h.agent?.name ?? `${h.provider.slice(0, 6)}…${h.provider.slice(-4)}`, marketplace: h.marketplace === POKTER_MARKETPLACE ? 'Pokter' : h.marketplace, chainId: h.chainId, jobId: h.jobId })),
    },
    build: owned ? owned.map((a) => ({ chainId: a.chainId, tokenId: a.tokenId, name: a.name, inWindow: a.inWindow })) : null,
    adoption:
      candidate && adoption
        ? { chainId: candidate.chainId, tokenId: candidate.tokenId, name: candidate.name, independentWallets: adoption.independentWallets, actions: adoption.actions, activeDays: adoption.activeDays, actionsBlockedReason: adoption.actionsBlockedReason }
        : null,
  };
}

/**
 * A wallet's campaign hires: the escrow index that /quest reads, plus
 * Pokter's own job index. Hires made through Pokter are in its own index
 * the moment they are funded, while the escrow index catches up on a
 * schedule; reading only the latter showed a wallet with a funded Pokter
 * hire as having hired nothing. One row per escrow job.
 */
export async function campaignHires(address: string, indexed?: QuestHire[]): Promise<{ hires: QuestHire[]; summary: ReturnType<typeof summariseQuest> }> {
  const fromEscrow = indexed ?? (await lookupQuest(address)).hires;
  const seen = new Set(fromEscrow.map((h) => `${h.chainId}:${h.jobId}`));
  const ours: QuestHire[] = getJobStore()
    .byClient(address)
    .filter((job) => job.status !== 'OPEN' && (job.chainId === 56 || job.chainId === 97) && !seen.has(`${job.chainId}:${job.jobId}`))
    .map((job) => ({
      chainId: job.chainId,
      jobId: job.jobId,
      provider: job.provider,
      agent: { chainId: job.agentChainId ?? 56, tokenId: job.agentTokenId, name: job.agentName },
      marketplace: POKTER_MARKETPLACE,
      status: job.status,
    }));
  const hires = [...ours, ...fromEscrow];
  return { hires, summary: summariseQuest(hires) };
}
