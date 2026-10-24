import { NextResponse } from 'next/server';

import { classify } from '@/lib/agents/categories';
import { deliveryTimes } from '@/lib/agent/delivery-times';
import { canonicalTokenId } from '@/lib/builder/diagnostics/attempt';
import { mapWithConcurrency } from '@/lib/concurrency';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { prepareAgent } from '@/lib/erc8183/courier';
import { POKTER_TERMS, requestQuote } from '@/lib/erc8183/quote';
import { getProbeStore } from '@/lib/history/store';
import { briefAcceptable, BRIEF_MIN } from '@/lib/hire/brief';
import { compileBrief } from '@/lib/hire/brief-compiler';
import { compareRow, orderRows, unusableQuoteReason, type CompareRow } from '@/lib/hire/compare-quotes';
import { describeQuoteFailure, quoteFailure, type QuoteFailure } from '@/lib/hire/failure';
import { networkOf } from '@/lib/mcp/agent-card';
import { escrowChainForCurrency } from '@/lib/network/escrow';
import { formatQuoted } from '@/lib/network/tokens';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** At most this many agents per comparison: each is a real request to its builder's endpoint. */
const MAX_COMPARED = 4;

/**
 * One brief, several agents: a signed price from each, side by side.
 *
 * Each agent is asked exactly what the hire page asks it (the same
 * negotiation, the same terms, a 12s limit), all at once, so the
 * comparison takes as long as the slowest agent rather than the sum. The
 * brief is also run through the compiler, so an agent that needs a wallet
 * or an asset the brief does not name says so instead of looking broken.
 * Nothing is funded and nothing is recorded as demand.
 */
export async function POST(request: Request): Promise<NextResponse> {
  /* Tighter than a single quote: one call here reaches up to four builders' endpoints. */
  const rate = consumeRateLimit(`hire-quotes:${requestClientKey(request)}`, { limit: 3, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many comparisons. Wait a moment and try again.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const task = String(body.task ?? '').trim();
  if (task.length > 500) return NextResponse.json({ error: 'The brief must be 500 characters or fewer.' }, { status: 400 });
  const requested = Array.isArray(body.agents) ? body.agents : [];
  const agents: Array<{ chainId: ChainId; tokenId: string }> = [];
  for (const item of requested.slice(0, MAX_COMPARED)) {
    const chainId = Number((item as Record<string, unknown>)?.chainId) as ChainId;
    const tokenId = canonicalTokenId(String((item as Record<string, unknown>)?.tokenId ?? ''));
    if ((chainId === 56 || chainId === 97) && tokenId !== null && !agents.some((a) => a.chainId === chainId && a.tokenId === tokenId)) agents.push({ chainId, tokenId });
  }
  if (agents.length === 0) return NextResponse.json({ error: 'Name at least one agent to ask.' }, { status: 400 });

  const rows = await mapWithConcurrency(agents, MAX_COMPARED, async ({ chainId, tokenId }): Promise<CompareRow> => {
    const agent = await getAgent(chainId, tokenId).catch(() => null);
    const name = agent?.name || `Agent #${tokenId}`;
    const row = (fields: Omit<Parameters<typeof compareRow>[0], 'chainId' | 'tokenId' | 'name' | 'task'>) => compareRow({ chainId, tokenId, name, task, ...fields });
    if (!agent) return row({ quote: null, missing: [], failure: 'Pokter could not read this agent from the registry just now.', deliveryMs: null });
    if (!(await briefAcceptable(task, agent))) {
      return row({ quote: null, missing: [], failure: `The brief must be at least ${BRIEF_MIN} characters, or one of the examples this agent publishes.`, deliveryMs: null });
    }
    const classified = classify(agent);
    const category = classified === 'unclassified' ? '' : classified;
    let failure: QuoteFailure | null = null;
    let refusal: string | null = null;
    const [quote, compiled, delivery] = await Promise.all([
      requestQuote(agent, {
        timeoutMs: 12_000,
        enquiry: { task_description: task, terms: POKTER_TERMS },
        onRefused: (reason) => {
          refusal = reason;
        },
        onFailure: (reason) => {
          failure = reason;
        },
      }),
      prepareAgent({ chainId, tokenId, category })
        .then((prepared) => compileBrief({ intent: task, skills: prepared.skills.length > 0 ? prepared.skills : [{ id: prepared.skill.id, name: prepared.skill.name, examples: [] }], skillId: prepared.skill.id, category }))
        .catch(() => null),
      deliveryTimes(chainId, tokenId).catch(() => null),
    ]);
    if (quote) {
      try {
        getProbeStore().noteBriefQuote(chainId, tokenId, { payable: escrowChainForCurrency(quote.currency) !== null });
      } catch {
        /* Bookkeeping only: the quote stands. */
      }
    }
    /*
     * The hire page's own check, so a row says "priced" only when Hire
     * would accept the price: a currency no escrow settles, or a quote
     * bound to another chain or contract, is refused there with a 409.
     * Shown as priced here, the buyer chose an agent and was turned away.
     */
    const unusable = quote ? unusableQuoteReason(quote, (id) => correctedErc8183Addresses(id).commerce) : null;
    const hireable = quote && !unusable ? quote : null;
    const formatted = hireable ? formatQuoted(hireable.currency, hireable.priceRaw) : null;
    const known = (failure as QuoteFailure | null) ?? quoteFailure('no-quote');
    const reason = hireable ? null : (unusable ?? describeQuoteFailure(refusal ? { ...known, sellerReason: refusal } : known, name).message.replace(/ ?(?:Try again shortly; )?[Nn]othing has been paid\.?/, '').trim());
    return row({
      quote: hireable ? { label: formatted?.label ?? null, network: networkOf(formatted?.chainId ?? null), expiresAt: hireable.expiresAt ?? null } : null,
      missing: (compiled?.missing ?? []).map((m) => ({ label: m.label, question: m.question })),
      failure: reason,
      deliveryMs: delivery?.medianMs ?? null,
    });
  });

  const priceOf = (row: CompareRow) => {
    const n = Number.parseFloat(row.price?.label ?? '');
    return Number.isFinite(n) ? n : null;
  };
  return NextResponse.json({ rows: orderRows(rows, priceOf), observedAt: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } });
}
