import { judgeStaticAnswer, STATIC_SUITES, type StaticAssayCategory, type StaticScenario } from './category-suites';
import type { AssayScenarioResult } from './types';

/**
 * Grading the artifact a funded job delivered, against the fixture it was
 * asked.
 *
 * Pokter had judges for every category and a store full of delivered
 * artifacts, and nothing that put the two together: `judgeStaticAnswer` was
 * only ever called on a free direct call. So an agent that does its work
 * only when paid — which is every agent with real customers — answered the
 * free check with a price, recorded `paid-only`, and could never earn the
 * "Checked" step however correct it was. The agents worth checking were the
 * ones Pokter could not check.
 *
 * This grades what a buyer actually receives, which is also the thing worth
 * being right about: a free preview and a paid deliverable are different
 * code paths on most agents, and only one of them is what anybody pays for.
 *
 * Pure, and deliberately not `server-only`: the deliverable store and the
 * job store are server code, but deciding whether an answer is correct is
 * arithmetic over two values and belongs in tests.
 */

function excerptOf(raw: string | null): string | null {
  if (!raw) return null;
  return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
}

/**
 * The agent's answer, read out of a stored ERC-8183 manifest.
 *
 * The manifest wraps the answer as `response.content`, a JSON string (see
 * `evidence/deliver.ts`). An object parsed out of it is the structured
 * answer the judges read; anything that will not parse is still returned as
 * text, so a prose-only delivery is graded and fails on its merits rather
 * than being discarded as unreadable.
 */
export function answerFromManifest(manifestText: string): { text: string | null; data: Record<string, unknown> | null } | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return null;
  }
  if (typeof manifest !== 'object' || manifest === null) return null;
  const response = (manifest as Record<string, unknown>).response;
  if (typeof response !== 'object' || response === null) return null;
  const content = (response as Record<string, unknown>).content;

  if (content && typeof content === 'object') {
    return { text: null, data: content as Record<string, unknown> };
  }
  if (typeof content !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return { text: null, data: parsed as Record<string, unknown> };
    }
  } catch {
    // Prose, or malformed JSON. Graded as text below.
  }
  return { text: content, data: null };
}

export function scenarioOf(category: StaticAssayCategory, scenarioId: string): StaticScenario | null {
  return STATIC_SUITES[category]?.scenarios.find((s) => s.id === scenarioId) ?? null;
}

/**
 * One scenario's result, from the job that paid for it.
 *
 * `delivered` absent means the job was funded and never delivered, which is
 * a failure of the check and not an absence of evidence: the buyer paid and
 * got nothing. It is recorded as `undelivered` rather than `wrong`, because
 * a reader deciding whether to hire the agent needs to know which happened.
 */
export function gradePaidScenario(input: {
  scenario: StaticScenario;
  jobId: string;
  /** The stored manifest, or null when the job never delivered one. */
  manifestText: string | null;
  latencyMs?: number | null;
}): AssayScenarioResult {
  const base = {
    scenario: input.scenario.id,
    expected: input.scenario.expected,
    jobId: input.jobId,
    latencyMs: input.latencyMs ?? null,
  };

  if (input.manifestText === null) {
    return { ...base, observed: null, excerpt: null, pass: false, outcome: 'undelivered', reason: 'The job was funded and no deliverable was submitted.' };
  }

  const answer = answerFromManifest(input.manifestText);
  if (!answer) {
    return { ...base, observed: null, excerpt: null, pass: false, outcome: 'unreadable', reason: 'The delivered manifest carried no readable answer.' };
  }

  const verdict = judgeStaticAnswer(input.scenario.expected, answer);
  return {
    ...base,
    observed: verdict.observed,
    excerpt: excerptOf(answer.data ? JSON.stringify(answer.data) : answer.text),
    pass: verdict.pass,
    outcome: verdict.pass ? 'correct' : verdict.observed ? 'wrong' : 'unreadable',
    reason: verdict.reason,
  };
}
