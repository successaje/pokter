import 'server-only';

import { classify, type ClassifiableAgent } from '@/lib/agents/categories';
import type { ChainId } from '@/lib/scan/types';
import { NotAskableError, prepareAgent } from './courier';
import { skillRequestData, type ResolvedSubject } from './skill-request';

/**
 * Whether the brief about to be funded can be turned into a request.
 *
 * Pokter takes payment and then discovers whether it can phrase the ask.
 * Job 1585 was quoted, signed and funded with a brief `agent_evidence`
 * could not read, and failed delivery for a day with its escrow funded.
 * The courier now fills the field the skill reads; this asks the same
 * question first, through the same `skillRequestData`, so a brief that
 * cannot be delivered is refused while the money is still the buyer's.
 *
 * Two things it deliberately does not do:
 *
 *  - It does not invent requirements. Only skills Pokter has an adapter for
 *    are checked, and only against what their own card says they read. An
 *    agent's published `examples` show how to ask; they are not a schema,
 *    and enforcing them as one would refuse briefs agents accept today.
 *  - It does not block a hire it cannot judge. An agent with no reachable
 *    card, no A2A endpoint or no skill Pokter recognises returns
 *    `skill: null` and the hire proceeds exactly as before. Quoting is how
 *    buyers discover agents, and a preflight that fails closed on every
 *    agent it cannot read would stop more hires than it saves.
 */
export type HirePreflight =
  | { ok: true; skill: string | null; subject: ResolvedSubject | null }
  | {
      ok: false;
      code: 'subject-missing' | 'subject-ambiguous';
      skill: string;
      message: string;
      candidates: string[];
    };

export async function preflightHireBrief(input: {
  chainId: ChainId;
  tokenId: string;
  task: string;
  /** The agent's record, when the caller already read it, to pick the skill delivery would pick. */
  agent?: ClassifiableAgent | null;
}): Promise<HirePreflight> {
  /*
   * The category decides which skill `pickWorkSkill` chooses, so it is
   * derived the way the seller derives it — `'unclassified'` passed on as
   * empty, because it is not a category and addressing the wrong skill is
   * worse than addressing the first one declared.
   */
  const classified = input.agent ? classify(input.agent) : 'unclassified';
  const category = classified === 'unclassified' ? '' : classified;

  let skillId: string;
  try {
    const prepared = await prepareAgent({ chainId: input.chainId, tokenId: input.tokenId, category });
    skillId = prepared.skill.id;
  } catch (error) {
    /*
     * An agent Pokter cannot address is a hire Pokter cannot judge, not a
     * hire to refuse. `NotAskableError` is the card saying nothing usable;
     * anything else is a read that failed. Either way the brief is not the
     * thing that is wrong, and the existing quote path already reports what
     * a seller does with it.
     */
    if (!(error instanceof NotAskableError) && process.env.NODE_ENV !== 'test') {
      console.info(`[hire-preflight] ${input.chainId}/${input.tokenId}: could not read the agent's skills (${(error as Error).name})`);
    }
    return { ok: true, skill: null, subject: null };
  }

  const request = skillRequestData({ skillId, task: input.task });
  return request.ok
    ? { ok: true, skill: skillId, subject: request.subject }
    : {
        ok: false,
        code: request.code,
        skill: skillId,
        message: request.message,
        candidates: request.candidates,
      };
}
