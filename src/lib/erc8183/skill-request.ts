import { subjectFromBrief, subjectKeyForSkill } from './brief-subject';
import type { ChainId } from '@/lib/scan/types';

/**
 * The structured request a skill is actually sent, decided once.
 *
 * Job 1585 was quoted, signed and funded with a brief its agent could not
 * read. `agent_evidence` takes its subject from `data.agent`; the brief
 * named the agent in prose, nothing filled that field, and the job failed
 * every scheduled delivery for a day with its escrow funded. The repair put
 * the field in at delivery time. This module is the same decision made
 * before the money moves, by the same code, so the two cannot disagree
 * about what Pokter is able to ask.
 *
 * It is deliberately not a schema reader. An agent's `examples` describe how
 * to ask, and the hire form already offers them as briefs, but an example is
 * not a declaration that its shape is mandatory: treating every published
 * example as a required input would refuse briefs that agents accept today.
 * What is enforced here is the narrow set of skills Pokter has an adapter
 * for — `agent_evidence` alone — and for those, only what the skill's own
 * card says it reads.
 *
 * Pure, so that the request asserted in a test is the request that is sent.
 */

/** The subject field a skill asked for, as resolved from the brief. */
export interface ResolvedSubject {
  key: 'agent';
  value: string;
  chainId: ChainId;
  tokenId: string;
}

/**
 * The resolved request, as the quote route hands it to the buyer.
 *
 * `skill: null` is an agent whose skills Pokter could not read, which is not
 * a refusal — see `hire-preflight`. `subject: null` is a skill that asks for
 * no subject, which is every skill but one.
 */
export interface SkillRequestPreview {
  skill: string | null;
  subject: ResolvedSubject | null;
}

export type SkillRequest =
  | { ok: true; data: Record<string, unknown>; subject: ResolvedSubject | null }
  | {
      ok: false;
      code: 'subject-missing' | 'subject-ambiguous';
      message: string;
      candidates: string[];
    };

/**
 * The `data` Pokter sends alongside the brief, or a refusal.
 *
 * `job_id` is present once there is a job, and absent before funding, which
 * is the only difference between the preflight's request and the delivery's.
 * Everything a skill is judged on is the same object in both.
 */
export function skillRequestData(input: {
  skillId: string;
  task: string;
  jobId?: string | number;
  chains?: readonly ChainId[];
}): SkillRequest {
  const data: Record<string, unknown> = { protocol: 'pokter-job' };
  if (input.jobId !== undefined) data.job_id = Number(input.jobId);

  const key = subjectKeyForSkill(input.skillId);
  if (!key) return { ok: true, data, subject: null };

  const subject = input.chains
    ? subjectFromBrief(input.task, input.chains)
    : subjectFromBrief(input.task);

  if (!subject.ok) {
    /*
     * Said once, here, because the buyer reads it at quoting time and the
     * diagnostic log reads it at delivery time, and a refusal that is
     * worded differently in the two places is two refusals to understand.
     */
    return subject.code === 'ambiguous'
      ? {
          ok: false,
          code: 'subject-ambiguous',
          message: `The brief names more than one agent (${subject.candidates.join(', ')}), and “${input.skillId}” reports on one. Pokter will not choose between them.`,
          candidates: subject.candidates,
        }
      : {
          ok: false,
          code: 'subject-missing',
          message: `“${input.skillId}” needs the agent named as a reference such as 97/2618, and the brief names none.`,
          candidates: [],
        };
  }

  data[key] = subject.agent;
  return {
    ok: true,
    data,
    subject: { key, value: subject.agent, chainId: subject.chainId, tokenId: subject.tokenId },
  };
}

/**
 * The body of the brief as the agent receives it.
 *
 * Lifted out of `sendPreparedBrief` unchanged so a test can assert the
 * object that actually goes over the wire rather than a copy of it that can
 * drift. The brief itself stays in `task` and `task_description`: the
 * structured fields are added beside it, and replace nothing.
 */
export function outboundBriefData(input: {
  skillId: string;
  category: string;
  task: string;
  data?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    skill: input.skillId,
    task: input.task,
    task_description: input.task,
    category: input.category,
    read_only: true,
    constraints: 'Read-only analysis. Execute no transaction and move no funds.',
    ...input.data,
  };
}

/** The A2A message parts for one brief: the prose, then the structured body. */
export function outboundParts(
  input: { task: string; briefData: Record<string, unknown> },
  { dataOnly = false }: { dataOnly?: boolean } = {},
): Array<{ kind: 'text'; text: string } | { kind: 'data'; data: Record<string, unknown> }> {
  // Some agents accept exactly one structured part; dataOnly sends that.
  return dataOnly
    ? [{ kind: 'data', data: input.briefData }]
    : [{ kind: 'text', text: input.task }, { kind: 'data', data: input.briefData }];
}

/**
 * The refusal, as both hire surfaces return it.
 *
 * `/api/hire/quote` and `/api/hire` refuse the same brief for the same
 * reason, and a buyer who hits one and then the other must not be told two
 * different things. `layer: 'input'` is what `useHire` reads to say the
 * brief is the thing to fix, rather than the seller or the network.
 */
export type BriefRefusalCode = 'subject-missing' | 'subject-ambiguous' | 'brief-declined';

export function briefRefusalBody(input: {
  message: string;
  code: BriefRefusalCode;
  skill: string | null;
  candidates?: string[];
  /**
   * What is still needed, one question per input.
   *
   * Carried beside the sentence so the hire form can put the questions
   * where the brief is written rather than printing one long refusal. A
   * refusal a buyer has to re-read to find the fix is a refusal that loses
   * the hire — which is what "actionable" has to mean here.
   */
  questions?: Array<{ key: string; label: string; question: string; hint: string | null; suggestion: string | null }>;
}): Record<string, unknown> {
  const candidates = input.candidates ?? [];
  const questions = input.questions ?? [];
  return {
    error: input.message,
    /*
     * Which layer refused, as `useHire` reads it. Pokter failing to turn the
     * brief into a request is the brief's shape; the agent declining it is
     * the agent's own judgement of the work, and saying "input" for that
     * would blame the buyer's wording for someone else's decision.
     */
    layer: input.code === 'brief-declined' ? 'seller' : 'input',
    code: input.code,
    retryable: false,
    skill: input.skill,
    ...(candidates.length > 0 ? { candidates } : {}),
    ...(questions.length > 0 ? { questions } : {}),
  };
}
