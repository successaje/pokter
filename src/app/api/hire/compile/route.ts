import { NextResponse } from 'next/server';

import { classify } from '@/lib/agents/categories';
import { compileBrief, type BriefAnswers } from '@/lib/hire/brief-compiler';
import { NotAskableError, prepareAgent } from '@/lib/erc8183/courier';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/**
 * What the agent will actually be asked, compiled from what the buyer wrote.
 *
 * The one thing the hire flow could not do before: say, in front of the
 * buyer and before any price is asked for, which skill the brief resolves
 * to, which of its declared inputs are filled, which are still missing, and
 * the exact text that will be sent. A buyer used to approve "the terms" and
 * find out at delivery what had been sent on their behalf — job 1585 is the
 * bill for that, and it was funded for a day.
 *
 * Separate from `/api/hire/quote` and `/api/hire/preflight` because those
 * both put the brief to the agent — one for a signed price, one for an
 * acceptance — and this answers a question that needs no agent at all. A
 * buyer editing their brief would otherwise spend a seller's round trip on
 * every keystroke batch.
 *
 * Read-only, and it moves nothing: it reads the registry record and the
 * agent's card, and returns a reading.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`hire-compile:${requestClientKey(request)}`, {
    limit: 30,
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
  /* The same ceiling the quote and preflight routes apply, for the same reason. */
  if (task.length > 2000) {
    return NextResponse.json({ error: 'The brief must be 2000 characters or fewer.' }, { status: 400 });
  }

  /*
   * The buyer's answers to this compiler's own questions, by field key.
   *
   * Read defensively because it arrives over the wire: string keys to
   * string values, and bounded, so a client cannot hand the compiler an
   * unbounded object or a nested one. A key that is not a field of the
   * resolved skill is simply never looked up.
   */
  const answers: Record<string, string> = {};
  const given = body.answers;
  if (given && typeof given === 'object' && !Array.isArray(given)) {
    for (const [key, value] of Object.entries(given as Record<string, unknown>).slice(0, 24)) {
      if (typeof key === 'string' && key.length <= 64 && typeof value === 'string' && value.length <= 2000) {
        answers[key] = value;
      }
    }
  }

  const agent = await getAgent(chainId, tokenId).catch(() => null);
  if (!agent) return NextResponse.json({ error: 'No such agent.' }, { status: 404 });

  /*
   * The category decides which skill `pickWorkSkill` chooses, derived the
   * way `hire-preflight` derives it — `'unclassified'` passed on as empty,
   * because it is not a category and compiling against the wrong skill is
   * worse than compiling against the first one declared.
   */
  const classified = classify(agent);
  const category = classified === 'unclassified' ? '' : classified;

  try {
    const prepared = await prepareAgent({ chainId, tokenId, category });
    return NextResponse.json({
      brief: compileBrief({
        intent: task,
        skills: prepared.skills.length > 0 ? prepared.skills : [{ id: prepared.skill.id, name: prepared.skill.name, examples: [] }],
        skillId: prepared.skill.id,
        category,
        answers: answers as BriefAnswers,
      }),
      observedAt: new Date().toISOString(),
    });
  } catch (error) {
    /*
     * An agent Pokter cannot address is reported as that, not as an error.
     *
     * `compileBrief` with no skills returns the `unestablished` reading,
     * whose note says in those words that the input requirements could not
     * be established and that the brief will be sent as written. Returning
     * 502 here would read as "this agent is broken", which is a claim about
     * the agent that a failed card read does not support — and would stop a
     * hire the existing preflight deliberately lets through.
     */
    if (!(error instanceof NotAskableError) && process.env.NODE_ENV !== 'test') {
      console.info(`[hire-compile] ${chainId}/${tokenId}: could not read the agent's skills (${(error as Error).name})`);
    }
    return NextResponse.json({
      brief: compileBrief({ intent: task, skills: [], category, answers: answers as BriefAnswers }),
      observedAt: new Date().toISOString(),
    });
  }
}
