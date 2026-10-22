import { NextResponse } from 'next/server';

import { askIfAgentTakesBrief } from '@/lib/erc8183/brief-acceptance';
import { preflightHireBrief } from '@/lib/erc8183/hire-preflight';
import { briefRefusalBody } from '@/lib/erc8183/skill-request';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/**
 * Whether a brief can be turned into a request, for a hire with no quote.
 *
 * `/api/hire/quote` already answers this on its way to a signed price, but
 * it only runs when the agent is itself the on-chain provider. Where
 * Pokter's seller carries the brief there is no quote to ask for, so there
 * was no pre-funding check on that path at all: a buyer could fund a brief
 * the agent cannot read and find out at delivery, which is the failure job
 * 1585 was.
 *
 * The same `preflightHireBrief` and the same refusal body, so the three
 * hire surfaces agree. Read-only: it reads the agent's record and its card
 * and writes nothing, on chain or off.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`hire-preflight:${requestClientKey(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many checks. Wait a moment and try again.' },
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
  /* The same ceiling the quote route applies, for the same reason. */
  if (task.length > 2000) {
    return NextResponse.json({ error: 'The brief must be 2000 characters or fewer.' }, { status: 400 });
  }

  const agent = await getAgent(chainId, tokenId).catch(() => null);
  if (!agent) return NextResponse.json({ error: 'No such agent.' }, { status: 404 });

  const preflight = await preflightHireBrief({ chainId, tokenId, task, agent });
  if (!preflight.ok) {
    return NextResponse.json(
      briefRefusalBody({
        message: preflight.message,
        code: preflight.code,
        skill: preflight.skill,
        candidates: preflight.candidates,
      }),
      { status: 400 },
    );
  }

  /*
   * And whether the agent itself will take the brief.
   *
   * The adapter check above can only speak for skills Pokter has an adapter
   * for, which is one. This is the question for all the rest, put to the
   * only party that can answer it: the agent is sent the exact brief over
   * its own `negotiate` skill and a decline is read as a decline. It fails
   * open on everything else — see `brief-acceptance`.
   *
   * After the adapter check, because a brief Pokter cannot phrase should be
   * reported as that rather than sent to an agent to be puzzled over.
   */
  const accepted = await askIfAgentTakesBrief(agent, task);
  if (!accepted.ok) {
    return NextResponse.json(
      briefRefusalBody({
        /* The seller's own words, attributed: this is its judgement of the
           work, not Pokter's assessment of the brief. */
        message: accepted.reason
          ? `${agent.name || `Agent #${tokenId}`} declined this brief: \u201c${accepted.reason}\u201d`
          : `${agent.name || `Agent #${tokenId}`} declined this brief without saying why. Try one of the examples on its page, or a brief closer to what it describes.`,
        code: 'brief-declined',
        skill: preflight.skill,
      }),
      { status: 400 },
    );
  }

  return NextResponse.json({
    request: { skill: preflight.skill, subject: preflight.subject },
    /* Whether the agent answered, and why not when it did not: a brief the
       agent signed for is a different fact from one nobody could ask about,
       and collapsing them would report an unchecked brief as checked. */
    accepted: { answered: accepted.answered, failure: accepted.failure },
    observedAt: new Date().toISOString(),
  });
}
