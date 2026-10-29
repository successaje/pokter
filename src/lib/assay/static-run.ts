import 'server-only';

import { freeRunStatus } from './run-status';
import type { Category } from '@/lib/agents/categories';
import { NotAskableError, PaidOnlyError, prepareAgent, sendPreparedBrief } from '@/lib/erc8183/courier';
import { GRADING_RULES, NOT_COUNTED, STATIC_SUITES, judgeStaticAnswer, staticSuiteFor, unstatedNote, type StaticAssayCategory } from './category-suites';
import { dueForCheck } from './queue';
import { getAssayStore, type AssayRun, type AssayScenarioResult } from './store';
import { RECHECK_MS } from './run';

const RETRY_MS = 12 * 3_600_000;

function excerptOf(answer: { text: string | null; data: Record<string, unknown> | null }): string {
  const raw = answer.data ? JSON.stringify(answer.data) : (answer.text ?? '');
  return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
}

export async function runStaticCategorySuite(
  target: { chainId: number; tokenId: string; category: StaticAssayCategory },
): Promise<Omit<AssayRun, 'ranAt'>> {
  const store = getAssayStore();
  const suite = STATIC_SUITES[target.category];
  const base = { suite: suite.id, total: suite.scenarios.length, via: 'free-call' as const };
  let agent;
  try {
    agent = await prepareAgent(target);
  } catch (error) {
    if (!(error instanceof NotAskableError)) throw error;
    const run = { ...base, status: 'not-askable' as const, detail: error.message, passed: 0, results: [] };
    store.record(target, run);
    return run;
  }

  const results: AssayScenarioResult[] = [];
  for (const [index, scenario] of suite.scenarios.entries()) {
    try {
      let reply = await sendPreparedBrief(agent, scenario.brief, { timeoutMs: 12_000 });
      let verdict = judgeStaticAnswer(scenario.expected, reply.answer);
      if (!verdict.observed) {
        const retry = await sendPreparedBrief(agent, scenario.brief, { timeoutMs: 12_000, dataOnly: true }).catch(() => null);
        if (retry) {
          reply = retry;
          verdict = judgeStaticAnswer(scenario.expected, retry.answer);
        }
      }
      results.push({
        scenario: scenario.id,
        expected: scenario.expected,
        observed: verdict.observed,
        excerpt: excerptOf(reply.answer),
        pass: verdict.pass,
        outcome: verdict.pass ? 'correct' : verdict.observed && !verdict.stated ? 'not-stated' : 'wrong',
        reason: verdict.reason,
        latencyMs: reply.latencyMs,
      });
    } catch (error) {
      if (error instanceof PaidOnlyError && index === 0) {
        const run = { ...base, status: 'paid-only' as const, detail: error.message, passed: 0, results: [] };
        store.record(target, run);
        return run;
      }
      results.push({ scenario: scenario.id, expected: scenario.expected, observed: null, excerpt: null, pass: false, outcome: 'unreadable', reason: `No answer: ${(error as Error).message}`, latencyMs: null });
    }
  }
  const { status, detail } = freeRunStatus(results);
  /* An answer that states nothing the check compares is kept, with its reply, but not counted (`judgeStaticAnswer`). */
  const unstated = results.filter((result) => result.outcome === 'not-stated').length;
  const run = {
    ...base,
    status,
    detail: [detail, status === 'checked' && unstated > 0 ? unstatedNote(unstated, results.length) : null].filter(Boolean).join(' ') || null,
    passed: results.filter((result) => result.pass).length,
    total: results.filter((result) => !NOT_COUNTED.has(result.outcome)).length,
    results,
    rules: GRADING_RULES,
  };
  store.record(target, run);
  return run;
}

export async function runDueStaticCategoryChecks(
  agents: Array<{ chainId: number; tokenId: string; category: Category | 'unclassified' }>,
  { limit = 2, now = Date.now(), startWithinMs = 60_000 }: { limit?: number; now?: number; startWithinMs?: number } = {},
): Promise<{ checked: number; passedAll: number; notAskable: number; paidOnly: number }> {
  const store = getAssayStore();
  const due = (Object.keys(STATIC_SUITES) as StaticAssayCategory[]).flatMap((category) => {
    const suite = STATIC_SUITES[category];
    return dueForCheck(
      agents.filter((agent) => agent.category === category).map((agent) => ({ ...agent, category })),
      { lastRun: store.lastRunAt(suite.id), lastAttempt: store.lastFailedAttemptAt(suite.id) },
      { now, recheckMs: RECHECK_MS, retryMs: RETRY_MS, limit: 1 },
    );
  }).slice(0, limit);

  let checked = 0;
  let passedAll = 0;
  let notAskable = 0;
  let paidOnly = 0;
  const started = Date.now();
  for (const agent of due) {
    if (Date.now() - started > startWithinMs) break;
    const suite = staticSuiteFor(agent.category);
    if (!suite) continue;
    const run = await runStaticCategorySuite(agent).catch((error: unknown) => {
      store.noteFailedAttempt(agent, suite.id, (error as Error).message ?? String(error));
      return null;
    });
    if (!run) continue;
    checked += 1;
    if (run.status === 'not-askable') notAskable += 1;
    else if (run.status === 'paid-only') paidOnly += 1;
    else if (run.passed === run.total) passedAll += 1;
  }
  return { checked, passedAll, notAskable, paidOnly };
}
