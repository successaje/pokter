import { NextResponse } from 'next/server';
import { getAddress, type Address } from 'viem';

import { POST as placeBid } from '@/app/api/briefs/[id]/bids/route';
import {
  automationTokenFor,
  noteAutomationTokenUse,
} from '@/lib/builders/store';
import {
  AUTOMATION_SCOPES,
  automationTokenFromHeader,
  lastSeen,
  scopeRefusal,
  type AutomationScope,
} from '@/lib/builders/automation-token';
import { hashAutomationToken } from '@/lib/builders/automation-secret';
import type { AutomationTokenRecord } from '@/lib/builders/automation-store';
import { confirmAgentOwner } from '@/lib/builders/provider-identity';
import {
  notOwnedNote,
  ownershipUnavailableNote,
} from '@/lib/builders/provider-ownership';
import {
  earningsByChain,
  providerWorkload,
  reconcileStagedWork,
} from '@/lib/builders/provider-work-view';
import {
  PROVIDER_SERVER_IDENTITY,
  PROVIDER_TOOL_CHAIN,
  PROVIDER_TOOLS,
  type ProviderToolSpec,
} from '@/lib/assistant/provider-tools';
import {
  contentDigest,
  deliveryBlocked,
  deliveryKey,
  deliveryRetry,
  proposalKey,
  proposalRetry,
} from '@/lib/assistant/provider-work';
import {
  placeStagedProposal,
  recordStagedDelivery,
  recordStagedProposal,
  releaseUnsubmittedDelivery,
  stagedDelivery,
  stagedDeliveryByJob,
  stagedProposal,
} from '@/lib/assistant/provider-db';
import { scopeGuarded, withConfirmedAgent } from '@/lib/assistant/provider-gate';
import { cleanUntrusted, cleanUntrustedLines, untrusted } from '@/lib/assistant/untrusted';
import { answerMcp, type McpTool } from '@/lib/mcp/server';
import {
  acceptsProposals,
  amountToRaw,
  bidMessage,
  requestAmountLabel,
  requestCategoryLabel,
  requestCategoryOf,
  requestTokenOf,
  PROPOSAL_SIGNING_WINDOW_MS,
} from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { aboveBudget, proposalPriceFlexible, typedPriceProblem } from '@/lib/briefs/proposal-price';
import { jobAmountLabel, jobToken } from '@/lib/erc8183/job-amount';
import { amountWithinLimits } from '@/lib/hire/budget-limits';
import { chainLabel } from '@/lib/network/presentation';
import { displaySymbol, escrowMoney, paymentTokenAt, type PaymentToken } from '@/lib/network/tokens';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { originOf } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Pokter's provider surface, as an MCP server a provider's own assistant
 * drives with a scoped automation token.
 *
 * `/api/mcp` is the buying side and is open to anyone: every tool there is
 * a public read or a link. This one is the selling side, so it is
 * authenticated, and by a credential that is not the browser session —
 * see `builders/automation-token.ts` for why pasting that cookie into a
 * chat is the thing this exists to avoid.
 *
 * No CORS headers, deliberately. There is no browser client for this: an
 * MCP server reached with a bearer token belongs to a process on the
 * provider's own machine, and advertising cross-origin access to an
 * authenticated endpoint invites a credential into a page that has no
 * business holding one.
 *
 * Two things no tool here does, and the reason both are structural rather
 * than a matter of policy: Pokter holds no key for the agent owner and none
 * for the provider wallet, so placing a proposal and submitting a delivery
 * have nothing on the server to call. See `PROVIDER_TOOL_CHAIN`.
 */

const SERVER_HINT =
  'Pokter’s provider MCP server speaks Streamable HTTP over POST, with an automation token: Authorization: Bearer pka_…. Mint one at /build/automation.';

function unauthorised(message: string): NextResponse {
  return NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message } },
    { status: 401, headers: { 'www-authenticate': 'Bearer realm="pokter-provider"', 'cache-control': 'no-store' } },
  );
}

/** Where the human finishes a step no tool can. */
function handoffs(origin: string) {
  return {
    signProposals: new URL('/build/automation', origin).href,
    signDeliveries: new URL('/build/jobs', origin).href,
  };
}

const chainOf = (value: unknown) => (value === 56 || value === 97 || value === '56' || value === '97' ? Number(value) : null);
const tokenIdOf = (value: unknown) =>
  (typeof value === 'string' || typeof value === 'number') && /^\d{1,12}$/.test(String(value)) ? String(value) : null;
const jobIdOf = (value: unknown) =>
  (typeof value === 'string' || typeof value === 'number') && /^\d{1,18}$/.test(String(value)) ? String(value) : null;

/**
 * The money an amount is in, said every time a figure is: its token, and
 * whether that token is real money on its chain.
 *
 * Chain 97's tokens are test tokens with no value. A page that printed one
 * combined total once shipped as a claim about earnings, so nothing here
 * reports an amount without naming which money it is in — and a token that
 * is not known is said to be unknown, never called $U.
 */
const moneyOf = (chainId: number, token: Pick<PaymentToken, 'symbol'> | null) => escrowMoney(chainId, token);

/** A token as a tool result names it: by address, with the symbol and the scale its raw amounts are in. */
const tokenOf = (token: PaymentToken | null) =>
  token ? { address: token.address, symbol: displaySymbol(token), decimals: token.decimals } : null;

function tools(request: Request, token: AutomationTokenRecord): McpTool[] {
  const owner = getAddress(token.ownerAddress) as Address;
  const origin = originOf(request);
  const local = new URL(request.url).origin;
  const handoff = handoffs(origin);

  const spec = (name: string): ProviderToolSpec => {
    const found = PROVIDER_TOOLS.find((t) => t.name === name);
    if (!found) throw new Error(`No provider tool spec named ${name}`);
    return found;
  };

  const run = (name: string, body: (args: Record<string, unknown>) => Promise<{ data: unknown; isError?: boolean }>): McpTool => {
    const { title, description, inputSchema, scope } = spec(name);
    return {
      name,
      title,
      description,
      inputSchema,
      annotations: {
        /* Three of these write a row for a human to act on; none of them
           can sign, pay, or change anything on chain. `destructiveHint` is
           false on all of them because the two steps that commit anything
           are not tools at all. */
        readOnlyHint: scope === 'proposals:write' || scope === 'deliverables:prepare' ? false : true,
        destructiveHint: false,
        /* `submit_proposal` places a bid with the request's poster: a second
           call is refused as a duplicate, but it is not a no-op to repeat. */
        idempotentHint: name !== 'submit_proposal',
        openWorldHint: true,
      },
      /*
       * The one scope gate, and it is not a statement in front of the work
       * — `scopeGuarded` holds the body and decides whether to call it.
       *
       * It used to be a check here with `return body(args)` after it, and
       * the only coverage was a source regex that cannot see ordering:
       * moving the check to run after `await body(args)` left the whole
       * suite passing, so a token with no `deliverables:prepare` would have
       * written the staged row and *then* been refused. The ordering is now
       * a property of a pure module with its own mutation-tested suite.
       */
      run: scopeGuarded(scope, token, body),
    };
  };

  /**
   * One block of a tool's answer, or why this token is not shown it.
   *
   * `provider_status` carries no scope of its own, deliberately: it is the
   * honest first call for any live token, and it is where an assistant
   * learns what it may do. But it was also returning job and proposal state
   * — outstanding job ids with their staged content hashes, quoted prices,
   * and a count of indexed jobs — to a token holding none of the scopes
   * that govern them. A provider who minted a narrow `requests:read` token
   * for a less-trusted assistant was told it "cannot read their jobs", and
   * it could. Each block is now gated on the scope whose description claims
   * it.
   *
   * Withheld is said rather than omitted. An absent `jobsIndexed` reads as
   * zero and an absent list reads as "nothing is waiting", and reporting
   * absence as a fact is the defect this repository keeps shipping.
   */
  const scoped = <T>(needed: AutomationScope, read: () => T): T | { notShown: string } => {
    const refusal = scopeRefusal(token.scopes, needed);
    return refusal ? { notShown: refusal } : read();
  };

  /** What every tool that reports jobs or money says about agents it could not check. */
  const ownershipNotes = (fleet: { ownershipUnavailable: string[]; notOwned: string[] }) => ({
    ...(fleet.ownershipUnavailable.length ? { ownershipUnavailable: ownershipUnavailableNote(fleet.ownershipUnavailable) } : {}),
    ...(fleet.notOwned.length ? { noLongerOwned: notOwnedNote(fleet.notOwned) } : {}),
  });

  /** The agent this call names, if this token's wallet owns it right now. */
  const ownedAgent = async (args: Record<string, unknown>) => {
    const chainId = chainOf(args.agent_chain_id);
    const tokenId = tokenIdOf(args.agent_token_id);
    if (!chainId || !tokenId) {
      return { error: 'agent_chain_id must be 56 or 97 and agent_token_id a number.', agent: null as null };
    }
    const confirmed = await confirmAgentOwner(owner, chainId, tokenId);
    if (!confirmed.ok) return { error: confirmed.reason, agent: null as null };
    return { error: null as string | null, agent: { chainId, tokenId } };
  };

  return [
    run('provider_status', async () => {
      const [{ fleet, jobs }, waiting] = [await providerWorkload(owner), reconcileStagedWork(owner)];
      const granted = AUTOMATION_SCOPES.filter((s) => token.scopes.includes(s.id));
      const missing = AUTOMATION_SCOPES.filter((s) => !token.scopes.includes(s.id));
      return {
        data: {
          wallet: owner,
          token: {
            label: token.label,
            endsIn: token.hint,
            expiresAt: token.expiresAt,
            lastCall: lastSeen(token.lastUsedAt),
            grantedScopes: granted.map((s) => ({ id: s.id, allows: s.what })),
            notGranted: missing.map((s) => ({ id: s.id, wouldAllow: s.what, mintAt: handoff.signProposals })),
          },
          cannotSign:
            'This token cannot sign anything and no scope exists that would let it. Placing a proposal needs the agent owner’s signature and delivering a job needs a transaction from the provider wallet; both happen in the human’s own wallet, because Pokter holds neither key and will not hold one.',
          notHosting:
            'Installing this skill does not host the agent. Work is answered only while this assistant is running on the user’s own machine. A request posted while it is not running is still there when it next starts, but a funded job that waits past its delivery deadline expires and the buyer reclaims the budget — nothing on Pokter delivers on the agent’s behalf.',
          /* The fleet itself needs no scope: which agents a wallet owns is
             public on chain, it is the one thing this tool exists to state,
             and every entry here has just been confirmed against the
             registry. */
          agents: fleet.agents.map((agent) => ({
            chainId: agent.chainId,
            tokenId: agent.tokenId,
            name: agent.name,
            category: agent.categoryId,
            ownershipProvedAt: agent.provedAt,
            note: 'The ERC-8004 registry named this wallet as this agent’s owner on this call, and is read again on every call and before any proposal or delivery is staged.',
          })),
          ...(fleet.catalogueUnavailable.length
            ? {
                catalogueUnavailable: fleet.catalogueUnavailable,
                catalogueNote: `Pokter could not read the agent catalogue on ${fleet.catalogueUnavailable.map(chainLabel).join(' and ')} just now, so names and categories may be missing and find_requests cannot match on category. This is Pokter failing to read, not an answer about what this wallet owns.`,
              }
            : {}),
          ...ownershipNotes(fleet),
          waitingOnAHuman: {
            /* A staged proposal is proposal state and carries the price
               that was quoted, so it is `proposals:write`'s to read. */
            proposalsToSign: scoped('proposals:write', () =>
              waiting.proposals
                .filter((p) => p.state === 'awaiting-owner-signature')
                .map((p) => ({ key: p.key, requestId: p.requestId, priceU: p.priceU, paymentToken: p.paymentToken, signAt: handoff.signProposals })),
            ),
            /* A staged deliverable names a funded job and the hash of the
               work written against it, so it is `deliverables:prepare`'s. */
            deliveriesToSubmit: scoped('deliverables:prepare', () =>
              waiting.deliveries
                .filter((d) => d.state === 'awaiting-wallet-signature')
                .map((d) => ({ jobId: d.jobId, chainId: d.chainId, contentSha256: d.contentSha256, submitAt: handoff.signDeliveries })),
            ),
          },
          jobsIndexed: scoped('jobs:read', () => jobs.length),
          flow: PROVIDER_TOOL_CHAIN,
        },
      };
    }),

    run('find_requests', async (args) => {
      const { fleet } = await providerWorkload(owner);
      const briefs = getBriefStore();
      const all = briefs.all('open').filter((brief) => acceptsProposals(brief));
      const everything = args.all_categories === true;
      const wantChain = chainOf(args.chain_id);
      const minBudget = typeof args.min_budget === 'number' ? args.min_budget : null;
      const query = typeof args.query === 'string' ? args.query.trim().toLowerCase().slice(0, 200) : '';
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);

      const rows = all
        .filter((brief) => brief.poster.toLowerCase() !== owner.toLowerCase())
        .filter((brief) => (wantChain ? brief.chainId === wantChain : true))
        /* In each request's own token, whole units: never converted between tokens, so this is a floor per request, not a price order. */
        .filter((brief) => (minBudget === null ? true : brief.budgetU >= minBudget))
        .filter((brief) =>
          query ? `${brief.title} ${brief.brief}`.toLowerCase().includes(query) : true,
        )
        .map((brief) => {
          const category = requestCategoryOf(brief.category);
          const fit = category ? fleet.agents.filter((a) => a.categoryId === category) : [];
          const standing = fit
            .map((agent) => briefs.bidFor(brief.id, agent.chainId, agent.tokenId))
            .find((bid) => bid && bid.bidder.toLowerCase() === owner.toLowerCase());
          return { brief, category, fit, standing };
        })
        .filter((row) => (everything ? true : row.fit.length > 0));

      return {
        data: {
          /* Said rather than implied: the match is on a category both sides
             declared, which is the one claim neither side can make about
             the other. An empty list means no open request named a category
             one of these agents is listed under — not that nothing fits. */
          matchedOn: everything
            ? 'Every open request someone else posted, whether or not an agent of this wallet is listed under its category. Each row says what blocks a proposal.'
            : 'Open requests whose category one of this wallet’s agents is listed under, and which this wallet did not post. Pass all_categories to see the rest.',
          ...(fleet.catalogueUnavailable.length && !everything
            ? {
                warning: `The agent catalogue on ${fleet.catalogueUnavailable
                  .map(chainLabel)
                  .join(' and ')} could not be read, so some of this wallet’s agents have no category here and requests they could answer may be missing from this list. Retry, or pass all_categories.`,
              }
            : {}),
          ...ownershipNotes(fleet),
          total: rows.length,
          requests: rows.slice(0, limit).map(({ brief, category, fit, standing }) => ({
            id: brief.id,
            /* The budget in the request's token: whole units, base units at its decimals, and the token itself. A proposal must be in this token. */
            budgetU: brief.budgetU,
            budgetRaw: brief.budgetRaw,
            budget: requestAmountLabel(brief, brief.budgetU),
            token: tokenOf(requestTokenOf(brief)),
            escrowChainId: brief.chainId,
            money: moneyOf(brief.chainId, requestTokenOf(brief)),
            deliverDays: brief.deliverDays,
            closesAt: brief.closesAt ?? null,
            postedAt: brief.postedAt,
            poster: brief.poster,
            category: requestCategoryLabel(brief.category),
            page: new URL(`/requests/${brief.id}`, origin).href,
            eligibleAgents: fit.map((a) => ({ chainId: a.chainId, tokenId: a.tokenId, name: a.name })),
            ...(fit.length === 0
              ? {
                  blocked: category
                    ? `No agent of this wallet is listed under the request’s category (${requestCategoryLabel(brief.category) ?? category}), and only an agent in it will be matched. Changing an agent’s listing is done on Pokter, not here.`
                    : 'This request named no category Pokter recognises, so it matches no agent. A proposal for it would be refused.',
                }
              : {}),
            ...(standing
              ? {
                  alreadyProposed: {
                    bidId: standing.id,
                    priceU: standing.priceU,
                    price: requestAmountLabel({ chainId: brief.chainId, paymentToken: standing.paymentToken ?? brief.paymentToken }, standing.priceU),
                    placedAt: standing.placedAt,
                    note: 'This wallet already has a standing proposal on this request for that agent. Preparing another revises it rather than adding one.',
                  },
                }
              : {}),
            ...untrusted({
              title: cleanUntrusted(brief.title, 200),
              brief: cleanUntrusted(brief.brief),
              acceptance: cleanUntrustedLines(brief.acceptance),
              failSignals: cleanUntrustedLines(brief.failSignals),
            }),
          })),
        },
      };
    }),

    run('prepare_proposal', async (args) => {
      const requestId = typeof args.request_id === 'string' ? args.request_id.slice(0, 64) : '';
      const brief = requestId ? getBriefStore().get(requestId) : null;
      if (!brief) return { data: { error: 'No such request. Call find_requests for the open ones.' }, isError: true };
      if (!acceptsProposals(brief)) {
        return { data: { error: 'This request is no longer taking proposals, so nothing was prepared.' }, isError: true };
      }
      const owned = await ownedAgent(args);
      if (!owned.agent) return { data: { error: owned.error }, isError: true };
      const deliverDays = Number(args.deliver_days);
      const note = typeof args.note === 'string' ? args.note.trim().slice(0, 1200) : '';
      /* The price is read in the request's token, and only in it: a proposal in another money is refused by the bids route too. */
      const token = requestTokenOf(brief);
      if (!token) return { data: { error: 'This request is priced in a token Pokter cannot read, so no proposal can be prepared for it.' }, isError: true };
      if (!Number.isInteger(deliverDays) || deliverDays < 1 || deliverDays > 30) {
        return { data: { error: 'deliver_days must be a whole number of days from 1 to 30.' }, isError: true };
      }
      if (!note) return { data: { error: 'note is required: what the buyer reads about how the work will be done.' }, isError: true };
      /*
       * The price is the agent's own, asked now for this request and
       * recorded, so the proposal route accepts exactly it
       * (`proposal-price.ts`). price_u is not used.
       */
      /* Loaded here, not at the top: it reaches the agent through the escrow SDK, which only this tool needs. */
      const { askProposalQuote } = await import('@/lib/briefs/proposal-quote');
      const priced = await askProposalQuote(brief, owned.agent.chainId, owned.agent.tokenId);
      if (!priced.ok) return { data: { error: `${priced.error} Nothing was prepared.` }, isError: true };
      /*
       * The agent's signed price is the floor. price_u above it is used in
       * $U, whose hire funds what was proposed; in another token the hire
       * funds exactly the signed amount, so the signed price stands
       * (`proposal-price.ts`). Below it is refused.
       */
      let priceU = priced.quote.priceU;
      let priceRaw = BigInt(priced.quote.priceRaw);
      let priceNote: string | null = null;
      const passed = Number(args.price_u);
      if (args.price_u !== undefined && passed !== priceU) {
        const raw = Number.isFinite(passed) ? amountToRaw(passed, token.decimals) : null;
        const problem = typedPriceProblem(raw, priced.quote, token, priced.label, proposalPriceFlexible(brief.chainId, brief.paymentToken));
        if (problem && (raw === null || raw < priceRaw)) return { data: { error: `${problem} Nothing was prepared.` }, isError: true };
        const limits = raw !== null ? amountWithinLimits(token, raw) : null;
        if (!problem && raw !== null && limits && !limits.ok) return { data: { error: `${limits.reason} Nothing was prepared.` }, isError: true };
        if (problem) priceNote = `${problem} price_u was not used.`;
        else if (raw !== null) {
          priceU = passed;
          priceRaw = raw;
        }
      }
      const over = aboveBudget({ paymentToken: token.address, priceRaw: priceRaw.toString() }, brief);

      const key = proposalKey({ owner, requestId, agentChainId: owned.agent.chainId, agentTokenId: owned.agent.tokenId });
      /* Reconciled first, from the bids table, which is the only place a
         placed proposal exists. An assistant that restarted after its owner
         signed must be told the proposal is on the request rather than
         asked to stage it again. */
      reconcileStagedWork(owner);
      const existing = stagedProposal(key);
      const retry = proposalRetry(existing, { priceU, deliverDays, note });
      if (retry.action === 'placed') {
        return {
          data: {
            key,
            state: 'placed',
            bidId: retry.bidId,
            prepared: false,
            message: retry.message,
            page: new URL(`/requests/${requestId}`, origin).href,
          },
        };
      }
      const at = new Date().toISOString();
      const recorded = recordStagedProposal({
        key,
        owner,
        requestId,
        agentChainId: owned.agent.chainId,
        agentTokenId: owned.agent.tokenId,
        priceU,
        paymentToken: token.address,
        deliverDays,
        note,
        at,
      });
      if (recorded === 'already-placed') {
        const row = stagedProposal(key);
        return {
          data: {
            key,
            state: 'placed',
            bidId: row?.bidId ?? null,
            prepared: false,
            message: 'The owner signed this proposal while it was being prepared, so it is already on the request and nothing was changed.',
          },
        };
      }
      if (recorded === 'conflict') {
        /* Another row already holds this request and agent. Reported as
           itself rather than as this caller's own retry: "already placed"
           would be a claim about somebody else's proposal. */
        return {
          data: {
            error: `A proposal for this request and agent is already staged under a different key, and a request holds one standing offer per agent. Nothing was written. Review it at ${handoff.signProposals}.`,
          },
          isError: true,
        };
      }
      /*
       * The message is built now, with this moment in it, because that is
       * what the bids endpoint verifies: a proposal is accepted only if it
       * was signed inside `PROPOSAL_SIGNING_WINDOW_MS`, and the timestamp
       * is part of what the signature covers. So this cannot be a template
       * the owner signs whenever they get round to it — it is an offer with
       * a deadline, and prepare_proposal is called again for a fresh one.
       */
      const message = bidMessage({
        briefId: requestId,
        bidder: owner,
        placedAt: at,
        agentChainId: owned.agent.chainId,
        agentTokenId: owned.agent.tokenId,
        priceU,
        paymentToken: token.address,
        chainId: brief.chainId,
        deliverDays,
        note,
      });
      return {
        data: {
          key,
          state: 'awaiting-owner-signature',
          prepared: true,
          action: retry.action,
          message: retry.message,
          terms: {
            requestId,
            agent: `${owned.agent.chainId}:${owned.agent.tokenId}`,
            priceU,
            priceRaw: priceRaw.toString(),
            price: requestAmountLabel(brief, priceU),
            agentSigns: priced.label,
            priceSignedAt: priced.quote.quotedAt,
            ...(priceNote ? { priceNote } : {}),
            ...(over
              ? { aboveBudget: true, aboveBudgetNote: `${requestAmountLabel(brief, priceU)} is above this request’s budget of ${requestAmountLabel(brief, brief.budgetU)}. The buyer sees it marked “Above your budget” and has to agree to the amount when choosing it.` }
              : {}),
            budgetU: brief.budgetU,
            budgetRaw: brief.budgetRaw,
            token: tokenOf(token),
            escrowChainId: brief.chainId,
            money: moneyOf(brief.chainId, token),
            deliverDays,
            ...(deliverDays > brief.deliverDays
              ? { deliverDaysNote: `The request asks for delivery within ${brief.deliverDays} days and this proposal offers ${deliverDays}. The buyer sees both and may pick someone faster.` }
              : {}),
          },
          signing: {
            signer: owner,
            message,
            placedAt: at,
            signatureValidUntil: new Date(Date.parse(at) + PROPOSAL_SIGNING_WINDOW_MS).toISOString(),
            how: `This exact string must be signed by ${owner}, the wallet the registry names as the agent’s owner, in that person’s own wallet. Pokter cannot sign it. Either open ${handoff.signProposals} and sign it there, or have the owner sign this string and pass the signature and this placed_at to submit_proposal.`,
            expired: `If more than ${Math.round(PROPOSAL_SIGNING_WINDOW_MS / 60_000)} minutes pass before it is signed, the signature is refused as stale. Call prepare_proposal again for a fresh message; it is the same proposal under the same key, not a second one.`,
            never: 'Do not ask the owner for a private key or a seed phrase. A signature is all this needs, and nothing in this skill ever needs a key.',
          },
        },
      };
    }),

    run('submit_proposal', async (args) => {
      const key = typeof args.proposal_key === 'string' ? args.proposal_key.slice(0, 64) : '';
      const signature = typeof args.signature === 'string' ? args.signature.trim() : '';
      const placedAt = typeof args.placed_at === 'string' ? args.placed_at : '';
      const row = key ? stagedProposal(key) : null;
      if (!row) return { data: { error: 'No proposal is staged under that key. Call prepare_proposal first.' }, isError: true };
      if (row.owner.toLowerCase() !== owner.toLowerCase()) {
        return { data: { error: 'That proposal was staged by another wallet’s automation.' }, isError: true };
      }
      if (row.bidId) {
        return {
          data: { key, state: 'placed', bidId: row.bidId, placed: false, message: 'This proposal is already on the request. Nothing was sent, and a second submission would only replace it with the same terms.' },
        };
      }
      if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
        return { data: { error: 'signature must be the owner’s hex signature over the message prepare_proposal returned. Never a private key or a seed phrase.' }, isError: true };
      }
      if (Number.isNaN(Date.parse(placedAt))) {
        return { data: { error: 'placed_at must be the exact ISO timestamp that was in the signed message; it is part of what was signed.' }, isError: true };
      }
      /*
       * Through the public bids route, not around it. That route verifies
       * the signature against the owner the registry names right now,
       * refuses a stale one, and holds the price to the request's budget —
       * every check a proposal needs, already audited. Reimplementing them
       * here is how two paths come to disagree about who may offer an agent.
       */
      const forwarded = new Request(new URL(`/api/briefs/${row.requestId}/bids`, local).href, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...Object.fromEntries(
            (['fly-client-ip', 'x-forwarded-for', 'user-agent'] as const).flatMap((h) =>
              request.headers.get(h) ? [[h, request.headers.get(h) as string]] : [],
            ),
          ),
        },
        body: JSON.stringify({
          bidder: owner,
          signature,
          placedAt,
          content: {
            agentChainId: row.agentChainId,
            agentTokenId: row.agentTokenId,
            priceU: row.priceU,
            /* The token it was staged in; a row staged before tokens has none, which the bids route reads as $U and refuses on any other request. */
            paymentToken: row.paymentToken ?? null,
            deliverDays: row.deliverDays,
            note: row.note,
          },
        }),
      });
      const response = await placeBid(forwarded, { params: Promise.resolve({ id: row.requestId }) });
      const payload = (await response.json().catch(() => ({}))) as { bid?: { id?: string }; error?: string };
      if (!response.ok || !payload.bid?.id) {
        return {
          data: {
            error: payload.error ?? `The proposal was refused (HTTP ${response.status}). Nothing was placed.`,
            key,
            state: 'awaiting-owner-signature',
          },
          isError: true,
        };
      }
      const attached = placeStagedProposal(key, payload.bid.id);
      return {
        data: {
          key,
          state: 'placed',
          placed: true,
          bidId: payload.bid.id,
          attached,
          page: new URL(`/requests/${row.requestId}`, origin).href,
          next: 'The buyer chooses a proposal and then funds the escrow in their own wallet. Nothing here can make either happen; list_work shows the job once it is funded.',
        },
      };
    }),

    run('list_work', async (args) => {
      const { fleet, jobs } = await providerWorkload(owner);
      const state = args.state === 'submitted' || args.state === 'all' ? args.state : 'funded';
      const wantChain = chainOf(args.chain_id);
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const wanted = jobs
        .filter((job) => (wantChain ? job.chainId === wantChain : true))
        .filter((job) => (state === 'all' ? true : state === 'funded' ? job.status === 'FUNDED' : job.status === 'SUBMITTED'));
      return {
        data: {
          source:
            'Pokter’s own index of ERC-8183 jobs, each read back from chain before it was kept. A job funded in the last few minutes may not be here yet; the escrow is the authority.',
          ...(fleet.catalogueUnavailable.length
            ? { warning: `The agent catalogue on ${fleet.catalogueUnavailable.map(chainLabel).join(' and ')} could not be read, so jobs for agents known only from there may be missing from this list.` }
            : {}),
          ...ownershipNotes(fleet),
          total: wanted.length,
          jobs: wanted.slice(0, limit).map((job) => {
            const staged = stagedDeliveryByJob(job.chainId, job.jobId);
            const blocked = deliveryBlocked(job);
            return {
              jobId: job.jobId,
              chainId: job.chainId,
              /* The job's own token, read at funding or from the escrow; unknown is said, and its amount left in base units. */
              money: moneyOf(job.chainId, jobToken(job) ? paymentTokenAt(job.chainId, jobToken(job)!) : null),
              status: job.status,
              agent: `${job.agentChainId ?? 56}:${job.agentTokenId}`,
              amount: jobAmountLabel(job),
              budgetRaw: job.budgetRaw,
              token: jobToken(job) ? (tokenOf(paymentTokenAt(job.chainId, jobToken(job)!)) ?? { address: jobToken(job), symbol: null, decimals: null }) : null,
              deadline: job.expiredAt,
              providerWallet: job.provider,
              deliverableUrl: job.deliverableUrl,
              page: new URL(`/jobs/${job.jobId}${job.chainId === 97 ? '' : `?chain=${job.chainId}`}`, origin).href,
              delivery: staged
                ? {
                    state: staged.state,
                    contentSha256: staged.contentSha256,
                    submitTxHash: staged.submitTxHash,
                    ...(staged.state === 'awaiting-wallet-signature'
                      ? { next: `A deliverable is staged and unsubmitted. The provider wallet ${job.provider} signs and submits it at ${handoff.signDeliveries}; until then nothing has been delivered.` }
                      : { next: 'Delivered on chain. Do not redo this work.' }),
                  }
                : { state: 'none' },
              ...(blocked ? { cannotDeliver: blocked } : { canDeliver: true }),
              ...untrusted({ task: cleanUntrusted(job.task) }),
            };
          }),
        },
      };
    }),

    run('prepare_deliverable', async (args) => {
      const jobId = jobIdOf(args.job_id);
      const chainId = chainOf(args.chain_id);
      const content = typeof args.content === 'string' ? args.content.trim() : '';
      if (!jobId || !chainId) {
        return { data: { error: 'job_id must be the numeric ERC-8183 job id and chain_id the escrow it was funded on (56 or 97).' }, isError: true };
      }
      if (content.length < 3 || content.length > 20_000) {
        return { data: { error: 'content must be between 3 and 20,000 characters: the finished work, with its sources, assumptions and limitations.' }, isError: true };
      }
      const { jobs } = await providerWorkload(owner);
      const job = jobs.find((j) => j.chainId === chainId && j.jobId === jobId);
      if (!job) {
        return {
          data: { error: `Pokter’s index holds no job ${jobId} on chain ${chainId} for one of this wallet’s agents. Call list_work; a job funded moments ago may not be indexed yet.` },
          isError: true,
        };
      }
      /*
       * The registry again, per request, and the staging is inside the
       * gate rather than after it.
       *
       * `withConfirmedAgent` holds the work and decides whether to run it,
       * exactly as `/api/builders/deliveries` reads ownership per request:
       * an agent transferred away stops being deliverable at once, and
       * "could not check" is never reported as "not yours". It used to be a
       * check with the staging beside it, and deleting the check left all
       * 1,875 assertions passing, because the source regex asserting it was
       * satisfied by the surviving call inside `ownedAgent`. There is now
       * no edit that leaves the refusal in place and the row written anyway.
       */
      return withConfirmedAgent(
        { chainId: job.agentChainId ?? 56, tokenId: job.agentTokenId },
        (agentChainId, agentTokenId) => confirmAgentOwner(owner, agentChainId, agentTokenId),
        async () => {
          const key = deliveryKey({ owner, chainId, jobId });
          /* Reconciled before anything is written, so a delivery submitted from
             a browser this process never saw is known about here. */
          reconcileStagedWork(owner);
          let existing = stagedDelivery(key) ?? stagedDeliveryByJob(chainId, jobId);
          /*
           * The job's one staged slot, held by another wallet. When that
           * wallet no longer owns the agent (it was transferred) and its
           * draft was never submitted, the draft can never be delivered by
           * anyone, and holding the slot would lock the new owner out for
           * good. Released after the same registry check every call makes;
           * a registry that cannot be read releases nothing.
           */
          if (existing && existing.key !== key && !existing.submitTxHash) {
            const previous = await confirmAgentOwner(existing.owner as Address, job.agentChainId ?? 56, job.agentTokenId);
            if (!previous.ok && previous.unavailable) {
              return { data: { error: previous.reason, staged: false }, isError: true };
            }
            if (!previous.ok) {
              /*
               * Released only while the escrow itself says nothing was
               * submitted. The index can lag a submission, and the former
               * owner's provider wallet may have sent this very draft
               * before Pokter recorded it; deleting it then would lose the
               * transaction for good. Loaded here, not at the top, so the
               * route's own tests do not load the SDK.
               */
              const { jobOnChain } = await import('@/lib/erc8183/job-onchain');
              const onchain = await jobOnChain(chainId, jobId);
              if (!onchain) {
                return { data: { error: 'Pokter could not read this job from chain just now, so it cannot release the former owner’s draft. Nothing was changed; try again shortly.', staged: false }, isError: true };
              }
              if (onchain.status === 'FUNDED' && onchain.submittedAt === 0n && releaseUnsubmittedDelivery(existing.key)) existing = stagedDelivery(key);
            }
          }
          const retry = deliveryRetry(existing, contentDigest(content));
          if (retry.action === 'submitted') {
            return {
              data: {
                key,
                state: 'submitted',
                staged: false,
                transactionHash: retry.transactionHash,
                message: retry.message,
              },
            };
          }
          const blocked = deliveryBlocked(job);
          if (blocked) return { data: { error: blocked, staged: false, jobStatus: job.status }, isError: true };
          if (existing && existing.key !== key) {
            return {
              data: {
                error: `A deliverable for job ${jobId} on chain ${chainId} was already staged by another wallet’s automation, and one job has one delivery. Nothing was written.`,
              },
              isError: true,
            };
          }
          const digest = contentDigest(content);
          const result = recordStagedDelivery({ key, owner, chainId, jobId, content, contentSha256: digest, at: new Date().toISOString() });
          if (result === 'conflict') {
            /* The index on (chain, job) refused it: another wallet's automation
               holds this job's one delivery. Not this caller's own submission,
               so it is not reported as one. */
            return {
              data: {
                error: `A deliverable for job ${jobId} on chain ${chainId} is already staged under another key, and one job has one delivery. Nothing was written.`,
              },
              isError: true,
            };
          }
          if (result === 'already-submitted') {
            const row = stagedDelivery(key);
            return {
              data: {
                key,
                state: 'submitted',
                staged: false,
                transactionHash: row?.submitTxHash ?? null,
                message: 'The delivery was submitted on chain while this was being staged, so nothing was written. Do not redo the work.',
              },
            };
          }
          return {
            data: {
              key,
              state: 'awaiting-wallet-signature',
              staged: true,
              /*
               * The decision, not the statement's own outcome.
               *
               * `recordStagedDelivery` answers `restaged` for every call that
               * was not the first, because the UPDATE always runs — it rewrites
               * identical bytes and touches `last_seen_at`. Reporting that as
               * `action` made a same-bytes retry say `restaged` beside a
               * message reading "nothing was written again": the field and the
               * sentence contradicting each other, which is precisely the
               * defect this repository keeps shipping. `retry.action` is what
               * actually happened to the work.
               */
              action: retry.action,
              message: retry.message,
              contentSha256: digest,
              hashNote:
                'That is the sha256 of the staged bytes, for recognising this work again. It is NOT the ERC-8183 deliverable hash: that is computed over a manifest recording the moment the provider signs, so it exists only then, and no hash printed before that will match the one on chain.',
              notDelivered:
                'NOTHING HAS BEEN DELIVERED. Staged text is a draft on Pokter. The delivery is a transaction from the provider wallet committing a hash of these exact bytes, and Pokter holds no key that could send it.',
              handoff: {
                providerWallet: job.provider,
                where: handoff.signDeliveries,
                what: `Open that page as ${job.provider}, review the staged text, and press Sign and deliver. It signs a challenge, Pokter stores the exact bytes and hashes them, the wallet commits that hash on chain, and the index checks the transaction before anything is marked delivered.`,
                deadline: job.expiredAt,
                ifNobodySigns: 'The work sits here unsubmitted. If the deadline passes undelivered the buyer reclaims the budget and nothing is paid — an assistant that is not running, or an owner who does not sign, both end the same way.',
              },
            },
          };
        },
      );
    }),

    run('report_earnings', async (args) => {
      const { fleet, jobs } = await providerWorkload(owner);
      const wantChain = chainOf(args.chain_id);
      const since = typeof args.since === 'string' ? Date.parse(args.since) : Number.NaN;
      const counted = jobs
        .filter((job) => (wantChain ? job.chainId === wantChain : true))
        .filter((job) => (Number.isFinite(since) ? Date.parse(job.hiredAt) >= since : true));
      return {
        data: {
          wallet: owner,
          counts:
            'Only released is earned. In escrow is money a buyer has committed and nobody has been paid. Awaiting review is delivered and not paid: the escrow pays out when the review window closes undisputed. Refunded expired undelivered; rejected lost a dispute.',
          /* Each line in its own token: the line's symbol, not the chain's default. */
          perChain: earningsByChain(counted).map((line) => ({ ...line, money: moneyOf(line.chainId, line.symbol ? { symbol: line.symbol } : null) })),
          ...(earningsByChain(counted).length > 1
            ? { noTotal: 'The lines are not added together: each is one chain and one token. 56 settles in real money and 97 in test tokens with no value, and $U and USDT are different money, so one combined figure would not be a number about money.' }
            : {}),
          jobsCounted: counted.length,
          ...ownershipNotes(fleet),
          source: 'Pokter’s own index of jobs it verified against the chain. The escrow is the authority; this is a reading of it.',
          collecting:
            'A released payment is collected by a transaction from the provider wallet, at /build/jobs. There is no tool for it here and Pokter never holds the money.',
        },
      };
    }),
  ];
}

export async function POST(request: Request): Promise<Response> {
  /*
   * The address limit comes first, before anything the caller supplied is
   * used as a key, and it is the brake an unauthenticated caller meets.
   *
   * The per-token bucket below is keyed on a hash of the Authorization
   * header — a value the caller chooses. Rotating it produced a fresh
   * bucket every request, so 135 requests with 135 different fake tokens
   * drew 135 answers and no 429 at all, while 135 with one token stopped
   * at 120. Worse than the missing brake: every distinct key INSERTs a row
   * into `/data/rate-limit.db`, which shares the one mounted volume with
   * the job index, the brief store and the builder database, and `prune`
   * only drops rows older than an hour while SQLite never returns the file
   * to the filesystem without VACUUM. An unauthenticated flood therefore
   * grew a file every other store depends on.
   *
   * This is the only one of this repo's consumeRateLimit call sites that
   * was not keyed on `requestClientKey`, and the reason it looked right is
   * written above the token bucket: an assistant behind one address should
   * not be throttled as if it were a crowd. That argument holds for the
   * token bucket and never applied to the key space.
   */
  const address = consumeRateLimit(`mcp-provider-ip:${requestClientKey(request)}`, { limit: 600, windowMs: 60_000 });
  if (!address.allowed) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: `Rate limit reached for this address. Retry in ${address.retryAfterSeconds}s.` } },
      { status: 429, headers: { 'retry-after': String(address.retryAfterSeconds) } },
    );
  }
  const secret = automationTokenFromHeader(request.headers.get('authorization'));
  if (!secret) {
    return unauthorised(
      `This endpoint needs a Pokter automation token: Authorization: Bearer pka_…. ${SERVER_HINT} The browser session cookie is not accepted here, and must never be pasted into a chat.`,
    );
  }
  const tokenHash = hashAutomationToken(secret);
  /*
   * Read on every call, and revoked and expired are excluded in the
   * lookup's own SQL. There is nothing cached between a revocation and the
   * next refusal: the row the next call reads is the row the page changed.
   *
   * Before the per-token bucket, not after: the bucket INSERTs a row per
   * key, and keyed on a token nobody issued, a caller rotating fake tokens
   * wrote one row per request. The lookup only reads, so a token Pokter did
   * not issue now writes nothing and meets only the address limit above.
   */
  const token = automationTokenFor(tokenHash);
  if (!token) {
    return unauthorised(
      'This automation token is not valid: it was revoked, it has expired, or it is not a token Pokter issued. Mint a new one at /build/automation. Scopes are never widened on an existing token.',
    );
  }
  /*
   * Per token as well as per address. A provider's assistant runs behind
   * one address and may be the only caller on it, so the address limit is
   * deliberately loose and this is what paces one credential. Keyed only on
   * tokens Pokter issued, so its key space is bounded by issuance (at most
   * ten live tokens per wallet).
   */
  const rate = consumeRateLimit(`mcp-provider:${tokenHash}`, { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: `Rate limit reached for this automation token. Retry in ${rate.retryAfterSeconds}s.` } },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }
  noteAutomationTokenUse(tokenHash);

  const body = await request.json().catch(() => undefined);
  if (body === undefined) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: the body is not JSON.' } }, { status: 400 });
  }
  /*
   * Its own identity in the handshake. `answerMcp` would otherwise answer
   * `initialize` as the buying server, with buyer instructions, on a
   * seller's endpoint — a false claim in the first message an assistant
   * reads. `PROVIDER_SERVER_IDENTITY` lives in a lib module so a test can
   * hold the route to using it.
   */
  const answer = await answerMcp(body, tools(request, token), [], PROVIDER_SERVER_IDENTITY);
  if (answer === null) return new Response(null, { status: 202 });
  return NextResponse.json(answer, { headers: { 'cache-control': 'no-store' } });
}

/** No server-initiated stream: every answer comes back on its POST. */
export function GET(): Response {
  return new Response(SERVER_HINT, { status: 405, headers: { allow: 'POST' } });
}
