import { notFound, redirect } from 'next/navigation';

import { answeredTasksFor } from '@/lib/agent/answered-tasks-sweep';
import { hireTaskFromRequest, type ProposalForHire } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { isCampaignLive } from '@/lib/campaign/window';
import { jobChainParam } from '@/lib/jobs/href';
import { requestToken } from '@/lib/network/tokens';
import { getJobStore } from '@/lib/erc8183/store';
import { currencyEvidence } from '@/lib/hire/currency-choice';
import { loadProfile } from '@/features/agent/profile';
import { deliversItself } from '@/features/hire/delivery';
import { HireNetworks, type HireNetwork } from '@/features/hire/HireNetworks';
import { ownRegistration } from '@/lib/agents/own-registration';
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
  initialCurrency = null,
  proposalId,
  embedded = false,
}: {
  chainId: number;
  tokenId: string;
  escrow?: string;
  initialTask: string | null;
  /** A currency to ask the agent to price in, from the link (`?pay=`); ignored unless offered on the escrow chain. */
  initialCurrency?: string | null;
  /** A proposal chosen on a request (`?proposal=`); ignored unless it is the chosen one, for this agent. */
  proposalId?: string;
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
        title={`${p.name} cannot be hired through escrow on Pokter`}
        action={
          <>
            <LinkButton href={`/agents/${chainId}/${tokenId}`} size="s" intent="secondary">Back to the agent</LinkButton>
            <LinkButton href={`/discover${p.category ? `?category=${p.category.id}&hireable=1` : '?hireable=1'}`} size="s">Hireable alternatives</LinkButton>
          </>
        }
      >
        {p.testnetRelay && p.escrowOptions.length === 0
          ? `${p.testnetRelay.note} Pokter does not take payment for a job nobody can deliver.`
          : 'No provider wallet that can receive an escrowed job was found for it. Pokter does not take payment for a job nobody can deliver.'}
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
  /* Every job funded through Pokter for this agent, once; each network reads its own chain's. */
  const agentJobs = getJobStore().byAgent(chainId, tokenId);
  const networks = [p, ...others.flatMap((r) => (r.state === 'ok' && r.profile.escrow.chainId !== p.escrow.chainId ? [r.profile] : []))]
    .sort((a, b) => p.escrowOptions.indexOf(a.escrow.chainId) - p.escrowOptions.indexOf(b.escrow.chainId))
    .map((profile) => ({
      chainId: profile.escrow.chainId,
      escrow: profile.escrow,
      providers: profile.providers,
      signedQuoteU: profile.quote && profile.quote.current && profile.quote.payable !== false ? profile.quote.priceU : null,
      lastSignedU: profile.quote && !profile.quote.current && profile.quote.payable !== false ? profile.quote.priceU : null,
      quoteCurrency: profile.quote?.currency ?? null,
      /* What Pokter has seen this agent price or be funded in, on this escrow chain only. */
      currencyEvidence: currencyEvidence({
        escrowChainId: profile.escrow.chainId,
        quote: profile.quote ? { currency: profile.quote.currency, settlementChainId: profile.quote.settlementChainId } : null,
        jobs: agentJobs,
      }),
      suggestedU: profile.suggestion?.u ?? null,
      warnings: profile.warnings,
    }));

  /*
   * A network only Pokter's delivery agent can serve here, where the same
   * agent — same owner, same name — has its own registration: hiring that
   * registration is the agent delivering itself. Relayed, an agent that
   * works only when paid through escrow answers the relay with a price,
   * and the job sits funded until it expires; that is how testnet job 1572
   * was hired from Brinkwatch's mainnet page and never delivered.
   */
  const handoffs = await Promise.all(
    networks.map((n) => (n.chainId === chainId || deliversItself(n.providers) ? Promise.resolve(null) : ownRegistration(n.chainId, p.owner, p.name, chainId, tokenId))),
  );
  const withHandoffs: HireNetwork[] = networks.map((n, i) => (handoffs[i] ? { ...n, handoff: handoffs[i] } : n));
  /* Opened straight onto a relayed network (a shared `?escrow=` link, or the only one offered): go to the agent's own registration. */
  const opening = withHandoffs.find((n) => n.chainId === p.escrow.chainId)?.handoff;
  if (opening && !proposalId) {
    const task = initialTask?.trim();
    redirect(`/hire/${opening.chainId}/${opening.tokenId}?escrow=${p.escrow.chainId}${task ? `&task=${encodeURIComponent(task)}` : ''}`);
  }

  const fromRequest = chosenProposal(proposalId, chainId, tokenId);

  return (
    <HireNetworks
      networks={withHandoffs}
      initialChainId={p.escrow.chainId}
      embedded={embedded}
      agent={{ chainId: p.chainId, tokenId: p.tokenId, name: p.name, category: p.category?.id ?? 'unclassified', wallet: p.agentWallet, imageUrl: p.imageUrl, key: p.key }}
      declaredSkills={p.skills}
      answeredTasks={answeredTasksFor(p.agentWallet)}
      campaignLive={isCampaignLive()}
      initialTask={initialTask ?? fromRequest?.task ?? null}
      initialCurrency={initialCurrency}
      proposal={fromRequest?.proposal ?? null}
    />
  );
}

/**
 * The proposal a hire link names, if it really is the one chosen on its
 * request and is for this agent. Anything else is ignored rather than
 * refused: the hire still works, only without a price to hold it to.
 */
function chosenProposal(id: string | undefined, chainId: number, tokenId: string): { proposal: ProposalForHire; task: string } | null {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const store = getBriefStore();
  const bid = store.bid(id);
  if (!bid || bid.agentChainId !== chainId || bid.agentTokenId !== tokenId) return null;
  const request = store.get(bid.briefId);
  if (!request || request.awardedBidId !== bid.id) return null;
  /*
   * The proposal's money, resolved once here: its own token, else its
   * request's, else (rows from before either carried one) the chain's $U.
   * A token Pokter cannot name drops the proposal rather than letting the
   * hire assume one — the hire then runs without a price to hold it to.
   */
  const token = requestToken(request.chainId, bid.paymentToken ?? request.paymentToken);
  if (!token) return null;
  return {
    proposal: {
      requestId: request.id,
      requestTitle: request.title,
      priceU: bid.priceU,
      priceRaw: bid.priceRaw,
      paymentToken: token.address,
      deliverDays: bid.deliverDays,
      chainId: request.chainId,
    },
    task: hireTaskFromRequest(request),
  };
}

/** A brief from the link, e.g. one an assistant composed through Pokter's MCP server. Prose only, and capped. */
export function briefFromLink(task: string | undefined): string | null {
  return typeof task === 'string' && task.trim() ? task.trim().slice(0, 2000) : null;
}

export { currencyFromLink } from './currency-link';

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
