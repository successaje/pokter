import { NextResponse } from 'next/server';

import { unpayablePriceNote } from '@/lib/erc8183/payable';
import { quoteUsableForEscrow } from '@/lib/erc8183/negotiation';
import { POKTER_TERMS, requestQuote } from '@/lib/erc8183/quote';
import { escrowChainForCurrency, isEscrowChain } from '@/lib/network/escrow';
import { BRIEF_MIN, briefAcceptable, declaredBriefs } from '@/lib/hire/brief';
import { declaredTaskProblems } from '@/lib/hire/task-fields';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { getJobStore } from '@/lib/erc8183/store';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { describeQuoteFailure, type QuoteFailure } from '@/lib/hire/failure';

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
  if (!quote && failure) {
    // Said by layer, with the status that fits it: a seller declining is not a gateway failure.
    const known = failure as QuoteFailure;
    const { message, status } = describeQuoteFailure(known.code === 'seller-declined' && refusal ? { ...known, sellerReason: refusal } : known, agent.name || `Agent #${tokenId}`);
    return NextResponse.json({ error: message, layer: known.layer, code: known.code, retryable: known.retryable }, { status });
  }
  if (!quote) {
    /*
     * A seller that says why is quoted verbatim. "lp_tier_plan needs the
     * token address" is a brief the buyer can fix; "it may be unreachable"
     * reads as a broken agent and loses the hire. Attributed, because these
     * are the seller's words and not Pokter's assessment.
     */
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
  if (escrowChainId === null) {
    return NextResponse.json(
      {
        error: unpayablePriceNote(quote.currency, !isEscrowChain(56)),
        reason: 'currency',
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
    return NextResponse.json(
      { error: usable.reason, reason: 'domain' },
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
    observedAt: new Date().toISOString(),
  });
}
