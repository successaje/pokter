import { NextResponse } from 'next/server';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { quotePayableWith } from '@/lib/erc8183/payable';
import { quoteUsableForEscrow } from '@/lib/erc8183/negotiation';
import { POKTER_TERMS, requestQuote } from '@/lib/erc8183/quote';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

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
  if (task.length < 10 || task.length > 2000) {
    return NextResponse.json(
      { error: 'The brief must be between 10 and 2000 characters.' },
      { status: 400 },
    );
  }

  const agent = await getAgent(chainId, tokenId).catch(() => null);
  if (!agent) {
    return NextResponse.json({ error: 'No such agent.' }, { status: 404 });
  }

  const quote = await requestQuote(agent, {
    timeoutMs: 20_000,
    enquiry: { task_description: task, terms: POKTER_TERMS },
  });
  if (!quote) {
    return NextResponse.json(
      {
        error:
          'The agent did not return a signed quote for this brief. It may be unreachable, or may not sell this work.',
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
  const { paymentToken } = correctedErc8183Addresses(ALTANA_NETWORK.chainId);
  if (!quotePayableWith(quote.currency, paymentToken)) {
    return NextResponse.json(
      {
        error:
          'The agent priced this work in a token this escrow cannot pay, so it would refuse the funded job.',
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
    ALTANA_NETWORK.chainId,
  );
  if (!usable.usable) {
    return NextResponse.json(
      { error: usable.reason, reason: 'domain' },
      { status: 409 },
    );
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
    },
    /* The exact text the signature covers, so the caller funds that and not a variant. */
    task,
    observedAt: new Date().toISOString(),
  });
}
