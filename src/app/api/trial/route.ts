import { NextResponse } from 'next/server';

import { BRIEF_MIN, briefAcceptable } from '@/lib/hire/brief';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import {
  consumeRateLimit,
  requestClientKey,
} from '@/lib/security/rate-limit';
import { POKTER_TERMS, requestQuote } from '@/lib/erc8183/quote';
import { describeQuoteFailure, quoteFailure, type QuoteFailure, withRecentQuote } from '@/lib/hire/failure';
import { getProbeStore } from '@/lib/history/store';
import { recordHireAttempt } from '@/lib/builder/diagnostics/store';
import { logAndPublic } from '@/lib/api/public-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/**
 * Read-only A2A negotiation trial.
 *
 * The caller identifies a registry agent, never an arbitrary URL. Pokter then
 * checks that the agent explicitly publishes the `negotiate` skill and sends
 * it the caller's brief, to its own endpoint, asking for a signed price. No
 * wallet, signature or on-chain write is involved on Pokter's side.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const client = requestClientKey(request);
  const rate = consumeRateLimit(`trial:${client}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Trial limit reached. Wait a moment before trying again.' },
      {
        status: 429,
        headers: { 'retry-after': String(rate.retryAfterSeconds) },
      },
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
  if (task.length > 500) {
    return NextResponse.json(
      { error: 'Trial task must be 500 characters or fewer.' },
      { status: 400 },
    );
  }

  try {
    const agent = await getAgent(chainId, tokenId);
    /*
     * The floor steps aside for a brief this agent publishes. It matters
     * most here: the trial exists so somebody can try an agent the way
     * it says to be tried, and it was refusing exactly that.
     */
    if (!(await briefAcceptable(task, agent))) {
      return NextResponse.json(
        { error: `Trial task must be at least ${BRIEF_MIN} characters, or one of the examples this agent publishes on its card.` },
        { status: 400 },
      );
    }
    const endpoint = agent.services?.a2a?.endpoint?.replace('{agentId}', tokenId);
    if (!endpoint) {
      return NextResponse.json(
        { error: 'This agent does not publish an A2A endpoint.' },
        { status: 409 },
      );
    }

    /*
     * The same negotiation a hire runs, not a copy of it. The trial used to
     * build its own request, which left out the settlement hint the hire
     * sends and checked less: a seller could answer the trial and refuse the
     * hire, or the reverse. Now a trial that succeeds is a quote the hire
     * would accept, signature and terms checked the same way.
     */
    const startedAt = Date.now();
    let failure: QuoteFailure | null = null;
    let refusal: string | null = null;
    const quote = await requestQuote(agent, {
      timeoutMs: 12_000,
      enquiry: { task_description: task, terms: POKTER_TERMS },
      onRefused: (reason) => {
        refusal = reason;
      },
      onFailure: (reason) => {
        failure = reason;
      },
    });
    /*
     * Recorded for the agent's builder as a **trial**, never as demand.
     *
     * This route has no wallet behind it and two very different callers: a
     * builder testing their own agent, and an assistant calling get_quote
     * on somebody's behalf. The second may well be a real buyer, so
     * excluding trials from demand undercounts it — which is the direction
     * to be wrong in. A builder able to raise their own demand figure by
     * pressing a test button is the direction that is not.
     */
    const note = (
      outcome: 'quoted' | 'stopped',
      at: { code?: QuoteFailure['code'] | null; layer?: QuoteFailure['layer'] | null; sellerReason?: string | null } = {},
    ) =>
      recordHireAttempt({
        request,
        chainId,
        tokenId,
        brief: task,
        source: 'trial',
        outcome,
        escrowChainId: null,
        code: at.code ?? null,
        layer: at.layer ?? null,
        sellerReason: at.sellerReason ?? null,
      });

    if (!quote) {
      const known = withRecentQuote((failure as QuoteFailure | null) ?? quoteFailure('no-quote'), getProbeStore().quotesFor([{ chainId, tokenId }]).get(`${chainId}:${tokenId}`)?.quotedAt);
      const { message, status } = describeQuoteFailure(refusal ? { ...known, sellerReason: refusal } : known, agent.name || `Agent #${tokenId}`);
      note('stopped', { code: known.code, layer: known.layer, sellerReason: refusal ?? known.sellerReason ?? null });
      return NextResponse.json({ error: message.replace(/ ?(?:Try again shortly; )?[Nn]othing has been paid\./, ''), layer: known.layer, code: known.code, retryable: known.retryable }, { status });
    }

    note('quoted');

    return NextResponse.json({
      // The fields the trial panel reads, from the verified quote.
      receipt: {
        response: { accepted: true, terms: { price: quote.priceRaw, currency: quote.currency } },
        negotiation_hash: quote.negotiationHash,
        provider_sig: quote.providerSignature,
        quote_expires_at: quote.expiresAt,
      },
      verifiedSigner: quote.signer,
      // requestQuote refuses a signature that does not cover these terms.
      termsBound: true,
      latencyMs: Date.now() - startedAt,
      endpoint: new URL(endpoint).origin,
      observedAt: new Date().toISOString(),
      disclaimer:
        'The EIP-191 quote signature matches the selected ERC-8004 provider wallet and covers these terms. This does not prove investment performance or execute a transaction.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Trial failed: ${logAndPublic('trial', error)}` },
      { status: 502 },
    );
  }
}
