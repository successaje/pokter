import 'server-only';

import { NotAskableError, prepareAgent, sendPreparedBrief } from '@/lib/erc8183/courier';
import { computeHealthFactor, hfBrief, HF_SCENARIOS, HF_SUITE_ID, judgeHf, readHfAnswer } from './health-factor';
import { getAssayStore, type AssayScenarioResult } from './store';

/** How long a result stands before the agent is checked again. */
export const RECHECK_MS = 3 * 86_400_000;

function excerptOf(answer: { text: string | null; data: Record<string, unknown> | null }): string {
  const raw = answer.data ? JSON.stringify(answer.data) : (answer.text ?? '');
  return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
}

/**
 * Run suite hf-1 against one agent and record the outcome.
 *
 * An agent with no endpoint or no work skill is recorded as not askable,
 * not as failing: that says nothing about whether it calculates correctly.
 * A registry or network failure before the first brief records nothing, so
 * the next sweep tries again. Once the agent is reachable, a timeout or an
 * error on a scenario counts against that scenario.
 */
export async function runHealthFactorSuite(target: { chainId: number; tokenId: string }) {
  let agent;
  try {
    agent = await prepareAgent({ ...target, category: 'health-factor' });
  } catch (error) {
    if (!(error instanceof NotAskableError)) throw error;
    const run = { suite: HF_SUITE_ID, status: 'not-askable' as const, detail: error.message, passed: 0, total: HF_SCENARIOS.length, results: [] };
    getAssayStore().record(target, run);
    return run;
  }
  const results: AssayScenarioResult[] = [];
  for (const scenario of HF_SCENARIOS) {
    const expected = computeHealthFactor(scenario.position);
    try {
      const reply = await sendPreparedBrief(agent, hfBrief(scenario), { timeoutMs: 15_000 });
      const observed = readHfAnswer(reply.answer);
      const verdict = judgeHf(expected, observed);
      results.push({ scenario: scenario.id, expected, observed, excerpt: excerptOf(reply.answer), pass: verdict.pass, reason: verdict.reason, latencyMs: reply.latencyMs });
    } catch (error) {
      results.push({ scenario: scenario.id, expected, observed: null, excerpt: null, pass: false, reason: `No answer: ${(error as Error).message}`, latencyMs: null });
    }
  }
  const run = { suite: HF_SUITE_ID, status: 'checked' as const, detail: null, passed: results.filter((r) => r.pass).length, total: HF_SCENARIOS.length, results };
  getAssayStore().record(target, run);
  return run;
}

/**
 * Check the health factor agents that are due, a bounded number per sweep:
 * never checked first, then the longest since their last check.
 */
export async function runDueHealthFactorChecks(
  agents: Array<{ chainId: number; tokenId: string }>,
  { limit = 6, now = Date.now() }: { limit?: number; now?: number } = {},
): Promise<{ checked: number; passedAll: number; notAskable: number }> {
  const last = getAssayStore().lastRunAt(HF_SUITE_ID);
  const due = agents
    .map((a) => ({ ...a, at: last.get(`${a.chainId}:${a.tokenId}`) ?? null }))
    .filter((a) => a.at === null || now - Date.parse(a.at) >= RECHECK_MS)
    .sort((a, b) => (a.at === null ? -1 : b.at === null ? 1 : a.at.localeCompare(b.at)))
    .slice(0, limit);
  let passedAll = 0;
  let notAskable = 0;
  for (const agent of due) {
    const run = await runHealthFactorSuite(agent).catch(() => null);
    if (!run) continue;
    if (run.status === 'not-askable') notAskable += 1;
    else if (run.passed === run.total) passedAll += 1;
  }
  return { checked: due.length, passedAll, notAskable };
}
