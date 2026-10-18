import { notFound } from 'next/navigation';

import { answeredTasksFor } from '@/lib/agent/answered-tasks-sweep';
import { isCampaignLive } from '@/lib/campaign/window';
import { jobChainParam } from '@/lib/jobs/href';
import { loadProfile } from '@/features/agent/profile';
import { HireFlow } from '@/features/hire/HireFlow';
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

  return (
    // Keyed on the escrow, so switching between hiring options starts the
    // form again rather than carrying a provider chosen for the other chain.
    <HireFlow
      key={p.escrow.chainId}
      embedded={embedded}
      agent={{ chainId: p.chainId, tokenId: p.tokenId, name: p.name, category: p.category?.id ?? 'unclassified', wallet: p.agentWallet, imageUrl: p.imageUrl, key: p.key }}
      providers={p.providers}
      signedQuoteU={p.quote && p.quote.current && p.quote.payable !== false ? p.quote.priceU : null}
      lastSignedU={p.quote && !p.quote.current && p.quote.payable !== false ? p.quote.priceU : null}
      suggestedU={p.suggestion?.u ?? null}
      warnings={p.warnings}
      escrow={p.escrow}
      escrowOptions={p.escrowOptions}
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
