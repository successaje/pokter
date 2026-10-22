import 'server-only';

import { classify, type ClassifiableAgent } from '@/lib/agents/categories';
import { compileBrief, type CompiledBrief } from '@/lib/hire/brief-compiler';
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
  | {
      ok: true;
      skill: string | null;
      subject: ResolvedSubject | null;
      /**
       * The compiled request, for the buyer to read and confirm.
       *
       * Null only where no card could be read at all, which is the one case
       * there is nothing to compile against. Everywhere else it is present
       * and says what it could and could not establish — including
       * "nothing", which is a reading, not a failure.
       */
      brief: CompiledBrief | null;
    }
  | {
      ok: false;
      code: 'subject-missing' | 'subject-ambiguous' | 'inputs-missing';
      skill: string;
      message: string;
      candidates: string[];
      /** The compilation that refused, so the surface can ask the questions it names. */
      brief: CompiledBrief | null;
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
  let declared: Awaited<ReturnType<typeof prepareAgent>>['skills'] = [];
  let skillName = '';
  try {
    const prepared = await prepareAgent({ chainId: input.chainId, tokenId: input.tokenId, category });
    skillId = prepared.skill.id;
    skillName = prepared.skill.name;
    declared = prepared.skills;
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
    return { ok: true, skill: null, subject: null, brief: null };
  }

  /*
   * What the buyer is funding, compiled against what this skill publishes.
   *
   * Through `compileBrief`, which the review screen also calls, so the
   * request a buyer confirms is the request this decides. It refuses only
   * when the skill's own published format names an input the brief does not
   * supply; an agent that publishes no format is reported as that and not
   * blocked, for the reason given above.
   */
  const brief = compileBrief({
    intent: input.task,
    skills: declared.length > 0 ? declared : [{ id: skillId, name: skillName || skillId, examples: [] }],
    skillId,
    category,
  });
  if (!brief.ok) {
    const questions = brief.missing.map((m) => m.question);
    return {
      ok: false,
      /* A subject refusal keeps its own code and its own wording: the
         adapter says it better than a generic list would, and three
         surfaces already quote that sentence. */
      code: brief.contract === 'adapter' ? (questions.length > 1 ? 'subject-ambiguous' : 'subject-missing') : 'inputs-missing',
      skill: skillId,
      message:
        brief.contract === 'adapter'
          ? (questions[0] ?? 'The brief does not name what this skill reports on.')
          : `${brief.skill?.name ?? skillId} needs more than this brief supplies. ${questions.join(' ')}`,
      candidates: [],
      brief,
    };
  }

  /*
   * The subject, still read through `skillRequestData`, because that is the
   * object the courier will build and nothing else may decide it. The
   * compilation above agrees with it by construction — it calls the same
   * function — and is carried alongside for what it adds: the fields, the
   * questions and the payload the buyer confirms.
   */
  const request = skillRequestData({ skillId, task: input.task });
  return request.ok
    ? { ok: true, skill: skillId, subject: request.subject, brief }
    : {
        ok: false,
        code: request.code,
        skill: skillId,
        message: request.message,
        candidates: request.candidates,
        brief,
      };
}
