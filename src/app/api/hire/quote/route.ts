import { NextResponse } from 'next/server';

import { unpayablePriceNote } from '@/lib/erc8183/payable';
import { quoteUsableForEscrow } from '@/lib/erc8183/negotiation';
import { POKTER_TERMS, requestQuote } from '@/lib/erc8183/quote';
import { escrowChainForCurrency, isEscrowChain } from '@/lib/network/escrow';
import { BRIEF_MIN, briefAcceptable, declaredBriefs } from '@/lib/hire/brief';
import { declaredTaskProblems } from '@/lib/hire/task-fields';
import { preflightHireBrief } from '@/lib/erc8183/hire-preflight';
import { briefRefusalBody } from '@/lib/erc8183/skill-request';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { getJobStore } from '@/lib/erc8183/store';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { describeQuoteFailure, quoteFailure, type QuoteFailure, withRecentQuote } from '@/lib/hire/failure';
import { getProbeStore } from '@/lib/history/store';
import { recordHireAttempt } from '@/lib/builder/diagnostics/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * A seller's signed quote for the brief about to be funded.
 *
 * Sellers that answer `negotiate` sign over the request as well as the
 * response, so the hash commits to this exact task and these exact terms.
 * A quote fetched earlier — by the sweep, for the price on the card, or for
 * a draft the buyer has since edited — does not govern the job that gets
 * funded, which is why this runs at the moment of hiring rather than
 * reusing what the catalogue already holds.
 *
 * Read-only: it moves no funds, grants no permission and writes nothing on
 * chain. What it returns is only ever handed back to the buyer's own
 * funding call, which commits it into the job description.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`hire-quote:${requestClientKey(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many quote requests. Wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const chainId = Number(body.chainId) as ChainId;
  const tokenId = String(body.tokenId ?? '');
  const task = String(body.task ?? '').trim();
  if ((chainId !== 56 && chainId !== 97) || !/^\d+$/.test(tokenId)) {
    return NextResponse.json({ error: 'Invalid agent identifier.' }, { status: 400 });
  }
  if (task.length > 2000) {
    return NextResponse.json(
      { error: 'The brief must be 2000 characters or fewer.' },
      { status: 400 },
    );
  }

  const agent = await getAgent(chainId, tokenId).catch(() => null);
  if (!agent) {
    return NextResponse.json({ error: 'No such agent.' }, { status: 404 });
  }

  /*
   * The length floor steps aside for a brief the agent published.
   * Checked after the agent is loaded, because deciding needs its card.
   */
  if (!(await briefAcceptable(task, agent))) {
    return NextResponse.json(
      { error: `The brief must be at least ${BRIEF_MIN} characters, or one of the examples this agent publishes on its card.` },
      { status: 400 },
    );
  }

  /*
   * The same rules the hire form applies, enforced here: a JSON task is
   * read against the examples the agent declares before any seller sees it.
   */
  if (/^[[{]/.test(task)) {
    const problems = declaredTaskProblems(task, await declaredBriefs(agent));
    if (problems.length > 0) {
      return NextResponse.json(
        { error: `The brief does not match what ${agent.name || `Agent #${tokenId}`} declares: ${problems.join('; ')}.`, layer: 'input', code: 'invalid-task', problems },
        { status: 400 },
      );
    }
  }

  /*
   * The structured request Pokter will send, settled before the escrow is
   * funded rather than at delivery.
   *
   * Job 1585 was quoted here, signed, funded, and then failed delivery for
   * a day because `agent_evidence` reads its subject from `data.agent` and
   * nothing filled it. The same `skillRequestData` the courier uses decides
   * it now, so a brief that cannot be turned into a request costs the buyer
   * a message instead of a deadline. An agent whose skills Pokter cannot
   * read is not refused — see `hire-preflight`.
   */
  const preflight = await preflightHireBrief({ chainId, tokenId, task, agent });
  if (!preflight.ok) {
    return NextResponse.json(
      briefRefusalBody({ message: preflight.message, code: preflight.code, skill: preflight.skill, candidates: preflight.candidates }),
      { status: 400 },
    );
  }

  let refusal: string | null = null;
  let failure: QuoteFailure | null = null;
  const quote = await requestQuote(agent, {
    timeoutMs: 20_000,
    enquiry: { task_description: task, terms: POKTER_TERMS },
    onRefused: (reason) => {
      refusal = reason;
    },
    onFailure: (reason) => {
      failure = reason;
    },
  });
  /*
   * Every outcome below is recorded for the agent's builder before it is
   * returned, because this route is the only place a buyer's own attempt
   * can be seen. The sweep asks the same question on a schedule and writes
   * `quote_failures`, and a builder reading that row cannot tell Pokter's
   * traffic from a customer's — which is the gap builder diagnostics
   * exists to close, so what it records has to come from the buyer's path
   * and nowhere else.
   *
   * Never the brief and never the caller: `recordHireAttempt` hashes both
   * with a per-database salt to collapse retries and keeps neither.
   */
  const noted = (
    outcome: 'quoted' | 'stopped',
    at: { code?: QuoteFailure['code'] | null; layer?: QuoteFailure['layer'] | null; sellerReason?: string | null; escrowChainId?: number | null } = {},
  ) =>
    recordHireAttempt({
      request,
      chainId,
      tokenId,
      brief: task,
      source: 'buyer',
      outcome,
      escrowChainId: at.escrowChainId ?? null,
      code: at.code ?? null,
      layer: at.layer ?? null,
      sellerReason: at.sellerReason ?? null,
    });

  if (!quote && failure) {
    // Said by layer, with the status that fits it: a seller declining is not a gateway failure.
    const known = withRecentQuote(failure as QuoteFailure, getProbeStore().quotesFor([{ chainId, tokenId }]).get(`${chainId}:${tokenId}`)?.quotedAt);
    const { message, status } = describeQuoteFailure(known.code === 'seller-declined' && refusal ? { ...known, sellerReason: refusal } : known, agent.name || `Agent #${tokenId}`);
    noted('stopped', { code: known.code, layer: known.layer, sellerReason: refusal ?? known.sellerReason ?? null });
    return NextResponse.json({ error: message, layer: known.layer, code: known.code, retryable: known.retryable }, { status });
  }
  if (!quote) {
    /*
     * A seller that says why is quoted verbatim. "lp_tier_plan needs the
     * token address" is a brief the buyer can fix; "it may be unreachable"
     * reads as a broken agent and loses the hire. Attributed, because these
     * are the seller's words and not Pokter's assessment.
     */
    const fallback = quoteFailure(refusal ? 'seller-declined' : 'no-quote');
    noted('stopped', { code: fallback.code, layer: fallback.layer, sellerReason: refusal });
    return NextResponse.json(
      {
        error: refusal
          ? `${agent.name} declined this brief: “${refusal}”`
          : 'The agent did not return a signed quote for this brief. It may be unreachable, or may not sell this work.',
      },
      { status: 502 },
    );
  }

  /*
   * Refused here rather than at funding time. Both of these produce a quote
   * that verifies and still cannot govern the job — the signature is honest
   * and bound to somewhere else — and finding that out after the escrow is
   * funded costs the buyer the wait for the deadline to pass.
   */
  // The escrow is the one that settles in the quoted token, so a price in
  // mainnet $U is funded on mainnet when mainnet is enabled, and refused here
  // when it is not.
  const escrowChainId = escrowChainForCurrency(quote.currency);
  /*
   * A buyer's brief got a signed, verified quote: proof this agent can be
   * priced, whatever the sweep's generic request got back
   * (`currentHireBlocker`). Recorded before the refusals below and carrying
   * whether an escrow settles its currency, because an agent signing
   * something unpayable must not read as an agent that can be hired — that
   * is the one thing a signature cannot establish.
   *
   * `payable` is the currency question only, which is the claim the
   * `payment-incompatible` blocker makes in so many words. The domain
   * checks under it refuse a quote for a different reason — honestly signed,
   * bound elsewhere — and have their own, so they do not fold in here.
   *
   * Bookkeeping, so a failed write never costs the quote.
   */
  try {
    getProbeStore().noteBriefQuote(chainId, tokenId, { payable: escrowChainId !== null });
  } catch {
    /* Nothing to do: the quote stands. */
  }
  if (escrowChainId === null) {
    noted('stopped', { code: 'payment-incompatible', layer: 'payment' });
    return NextResponse.json(
      {
        error: unpayablePriceNote(quote.currency, !isEscrowChain(56)),
        reason: 'currency',
        layer: 'payment',
        code: 'payment-incompatible',
        retryable: false,
      },
      { status: 409 },
    );
  }
  const usable = quoteUsableForEscrow(
    {
      expiresAt: quote.expiresAt ? Date.parse(quote.expiresAt) / 1000 : undefined,
      domain: quote.domain
        ? {
            chainId: quote.domain.chainId,
            verifyingContract: quote.domain.verifyingContract as `0x${string}`,
          }
        : undefined,
    },
    escrowChainId,
    new Date(),
    correctedErc8183Addresses(escrowChainId).commerce,
  );
  if (!usable.usable) {
    noted('stopped', {
      code: usable.code === 'expired' ? 'quote-expired' : 'payment-incompatible',
      layer: usable.code === 'expired' ? 'protocol' : 'payment',
      escrowChainId,
    });
    return NextResponse.json(
      {
        error: usable.reason,
        reason: 'domain',
        // Expired is worth asking again; a quote for another chain or contract is not.
        layer: usable.code === 'expired' ? 'protocol' : 'payment',
        code: usable.code === 'expired' ? 'quote-expired' : 'payment-incompatible',
        retryable: usable.code === 'expired',
      },
      { status: 409 },
    );
  }

  /*
   * Recorded before the buyer funds, so the job this quote governs is known
   * to be Pokter's by its hash alone: recoverable if the tab closes, and not
   * claimable for another marketplace's job in the same format.
   */
  try {
    getJobStore().recordQuoteIntent({
      negotiationHash: quote.negotiationHash,
      escrowChainId,
      provider: agent.agent_wallet ?? quote.signer,
      agentChainId: chainId,
      agentTokenId: tokenId,
      agentName: agent.name || `Agent #${tokenId}`,
    });
  } catch {
    /* A record that cannot be written costs recovery, not the quote. */
  }

  noted('quoted', { escrowChainId });

  return NextResponse.json({
    quote: {
      negotiationHash: quote.negotiationHash,
      providerSignature: quote.providerSignature,
      priceRaw: quote.priceRaw,
      priceU: quote.priceU,
      currency: quote.currency,
      signer: quote.signer,
      expiresAt: quote.expiresAt,
      domain: quote.domain,
      anchor: quote.anchor,
    },
    /* The escrow this price can be paid on, which the caller funds and no other. */
    escrowChainId,
    /* The exact text the signature covers, so the caller funds that and not a variant. */
    task,
    /*
     * What Pokter will ask, beyond the brief itself: the skill it resolved
     * and the subject it read out of the brief. Shown to the buyer so the
     * request they are funding is the request they can see.
     */
    request: { skill: preflight.skill, subject: preflight.subject },
    observedAt: new Date().toISOString(),
  });
}
