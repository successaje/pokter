import { notFound } from 'next/navigation';

import { answeredTasksFor } from '@/lib/agent/answered-tasks-sweep';
import { isCampaignLive } from '@/lib/campaign/window';
import { jobChainParam } from '@/lib/jobs/href';
import { loadProfile } from '@/features/agent/profile';
import { HireNetworks } from '@/features/hire/HireNetworks';
import type { ChainId } from '@/lib/scan/types';
import { LinkButton } from '@/ui/Button';
import { EmptyState } from '@/ui/Feedback';

/**
 * Everything the hire route renders, so the page and the sheet over the
 * catalogue cannot drift apart.
 *
 * They are the same offer and have to make the same refusals: an agent the
 * registry will not confirm, and an agent with no wallet that can receive
 * an escrowed job. Those two branches decide whether somebody is shown a
 * payment form, which is the last place to keep two copies.
 */
export async function HireContents({
  chainId,
  tokenId,
  escrow,
  initialTask,
  embedded = false,
}: {
  chainId: number;
  tokenId: string;
  escrow?: string;
  initialTask: string | null;
  /** Inside the sheet, where the sheet already draws the chrome. */
  embedded?: boolean;
}) {
  if ((chainId !== 56 && chainId !== 97) || !/^\d{1,12}$/.test(tokenId)) notFound();

  const result = await loadProfile(chainId as ChainId, tokenId, { escrow: jobChainParam(escrow) });
  if (result.state === 'missing') notFound();
  if (result.state === 'unreachable') {
    return (
      <EmptyState tone="bad" title="This agent cannot be checked right now" action={<LinkButton href={`/hire/${chainId}/${tokenId}`} size="s">Try again</LinkButton>}>
        The registry did not answer, so Pokter cannot confirm who would be paid. No hire is offered without that.
      </EmptyState>
    );
  }

  const p = result.profile;
  if (!p.hireable) {
    return (
      <EmptyState
        title={`${p.name} cannot be hired through Pokter`}
        action={
          <>
            <LinkButton href={`/agents/${chainId}/${tokenId}`} size="s" intent="secondary">Back to the agent</LinkButton>
            <LinkButton href={`/discover${p.category ? `?category=${p.category.id}&hireable=1` : '?hireable=1'}`} size="s">Hireable alternatives</LinkButton>
          </>
        }
      >
        No provider wallet that can receive an escrowed job was found for it. Pokter does not take payment for a job nobody can deliver.
      </EmptyState>
    );
  }

  /*
   * Every escrow this agent can be hired on, loaded together so the form
   * can switch between them in place (`HireNetworks`). The dossier behind
   * them is read once and shared; only the escrow-specific parts differ.
   */
  const others = await Promise.all(
    p.escrowOptions
      .filter((option) => option !== p.escrow.chainId)
      .map((option) => loadProfile(chainId as ChainId, tokenId, { escrow: option })),
  );
  const networks = [p, ...others.flatMap((r) => (r.state === 'ok' && r.profile.escrow.chainId !== p.escrow.chainId ? [r.profile] : []))]
    .sort((a, b) => p.escrowOptions.indexOf(a.escrow.chainId) - p.escrowOptions.indexOf(b.escrow.chainId))
    .map((profile) => ({
      chainId: profile.escrow.chainId,
      escrow: profile.escrow,
      providers: profile.providers,
      signedQuoteU: profile.quote && profile.quote.current && profile.quote.payable !== false ? profile.quote.priceU : null,
      lastSignedU: profile.quote && !profile.quote.current && profile.quote.payable !== false ? profile.quote.priceU : null,
      suggestedU: profile.suggestion?.u ?? null,
      warnings: profile.warnings,
    }));

  return (
    <HireNetworks
      networks={networks}
      initialChainId={p.escrow.chainId}
      embedded={embedded}
      agent={{ chainId: p.chainId, tokenId: p.tokenId, name: p.name, category: p.category?.id ?? 'unclassified', wallet: p.agentWallet, imageUrl: p.imageUrl, key: p.key }}
      declaredSkills={p.skills}
      answeredTasks={answeredTasksFor(p.agentWallet)}
      campaignLive={isCampaignLive()}
      initialTask={initialTask}
    />
  );
}

/** A brief from the link, e.g. one an assistant composed through Pokter's MCP server. Prose only, and capped. */
export function briefFromLink(task: string | undefined): string | null {
  return typeof task === 'string' && task.trim() ? task.trim().slice(0, 2000) : null;
}

/**
 * The agent's name for the sheet's title, read from the same profile the
 * form below it is built from.
 *
 * `loadProfile` is memoised per request, so asking twice in one render
 * costs one load. A name passed down from the card that was clicked would
 * be faster and would be whatever that card happened to say.
 */
export async function hireSheetAgent(chainId: number, tokenId: string, escrow?: string) {
  const fallback = { name: 'this agent', imageUrl: null, seed: `${chainId}:${tokenId}`, subline: '' };
  if ((chainId !== 56 && chainId !== 97) || !/^\d{1,12}$/.test(tokenId)) return fallback;
  const result = await loadProfile(chainId as ChainId, tokenId, { escrow: jobChainParam(escrow) });
  if (result.state !== 'ok') return fallback;
  const p = result.profile;
  /* The title only. Price and network sat here too, and went stale the
     moment the form below switched network; they are in the form. */
  return { name: p.name, imageUrl: p.imageUrl, seed: p.key, subline: '' };
}
