import type { AssayScenarioResult } from './types';

/**
 * Whether a free check produced anything to grade.
 *
 * A run was recorded as "checked" whenever its briefs were sent, so an
 * agent that answered none of them published as failing them all. Every
 * 0/3 on record was of that kind: an agent refusing direct calls to a skill
 * it sells only through escrow ("unknown skill"), Pokter calling an
 * agent's job-status skill by mistake, or replies in a shape Pokter did not
 * read. None of those is a wrong answer.
 *
 * A run counts as checked when at least one scenario came back with
 * something readable, right or wrong. Otherwise it is recorded as not
 * askable, with the first reason given, and nobody is marked wrong.
 */
export function freeRunStatus(results: AssayScenarioResult[]): { status: 'checked' | 'not-askable'; detail: string | null } {
  const answered = results.some((result) => result.observed != null || result.excerpt != null);
  if (results.length === 0 || answered) return { status: 'checked', detail: null };
  const reason = results.find((result) => result.reason)?.reason ?? 'No scenario got a readable answer.';
  return { status: 'not-askable', detail: `No scenario got an answer to grade: ${reason}` };
}
