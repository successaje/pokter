import 'server-only';

import type { Address } from 'viem';

import { NotAskableError, PaidOnlyError, prepareAgent, sendPreparedBrief } from '@/lib/erc8183/courier';
import { hfBrief, HF_SUITE_ID, judgeHf, readHfAnswer, type HfExpected } from './health-factor';
import { getAssayStore, type AssayRun, type AssayScenarioResult } from './store';
import { dueForCheck } from './queue';
import { readVenusPosition, sampleVenusBorrowers, venusClient, type VenusReading } from './venus';

/** How long a result stands before the agent is checked again. */
export const RECHECK_MS = 3 * 86_400_000;
/** How long an agent whose check failed waits before it is tried again. */
const RETRY_MS = 12 * 3_600_000;
/** How long a sample of Venus borrowers is reused before a new one is drawn. */
const SAMPLE_MS = 7 * 86_400_000;
const SAMPLE_SIZE = 3;

function excerptOf(answer: { text: string | null; data: Record<string, unknown> | null }): string {
  const raw = answer.data ? JSON.stringify(answer.data) : (answer.text ?? '');
  return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
}

function expectedOf(reading: VenusReading): HfExpected & { block: string } {
  return { healthFactor: reading.healthFactor, borrowLimitRatio: reading.borrowLimitRatio, liquidatable: reading.liquidatable, block: reading.block.toString() };
}

/** The accounts every agent is asked about this week, drawn once and reused. */
export async function currentSample(): Promise<Address[]> {
  const store = getAssayStore();
  const cached = store.sample(HF_SUITE_ID);
  if (cached && Date.now() - Date.parse(cached.sampledAt) < SAMPLE_MS && cached.accounts.length > 0) return cached.accounts as Address[];
  const accounts = await sampleVenusBorrowers(venusClient(), { count: SAMPLE_SIZE });
  if (accounts.length > 0) store.saveSample(HF_SUITE_ID, accounts);
  return accounts;
}

/**
 * Ask one agent for the health factor of each sampled account and compare
 * with Pokter's reading of Venus before and after its reply.
 *
 * Recorded as not askable when the agent has no endpoint or work skill,
 * and as paid only when it answers with a price: neither says anything
 * about whether it reads positions correctly. A registry or network failure
 * before the first question records nothing, so the next sweep tries again.
 */
export async function runHealthFactorSuite(target: { chainId: number; tokenId: string }, accounts: Address[]): Promise<Omit<AssayRun, 'ranAt'>> {
  const store = getAssayStore();
  const client = venusClient();
  const base = { suite: HF_SUITE_ID, total: accounts.length };
  let agent;
  try {
    agent = await prepareAgent({ ...target, category: 'health-factor' });
  } catch (error) {
    if (!(error instanceof NotAskableError)) throw error;
    const run = { ...base, status: 'not-askable' as const, detail: error.message, passed: 0, results: [] };
    store.record(target, run);
    return run;
  }

  const results: AssayScenarioResult[] = [];
  for (const [index, account] of accounts.entries()) {
    const before = await readVenusPosition(client, account);
    try {
      let reply = await sendPreparedBrief(agent, hfBrief(account, before.rows), { timeoutMs: 12_000 });
      let observed = readHfAnswer(reply.answer);
      if (!observed) {
        // Some agents accept exactly one structured part; ask once more that way.
        const retry = await sendPreparedBrief(agent, hfBrief(account, before.rows), { timeoutMs: 12_000, dataOnly: true }).catch(() => null);
        if (retry && readHfAnswer(retry.answer)) {
          reply = retry;
          observed = readHfAnswer(retry.answer);
        }
      }
      const after = await readVenusPosition(client, account);
      const verdict = judgeHf([expectedOf(before), expectedOf(after)], observed);
      results.push({
        scenario: account,
        expected: { before: expectedOf(before), after: expectedOf(after) },
        observed,
        excerpt: excerptOf(reply.answer),
        pass: verdict.pass,
        outcome: verdict.outcome,
        reason: verdict.reason,
        latencyMs: reply.latencyMs,
      });
    } catch (error) {
      if (error instanceof PaidOnlyError && index === 0) {
        const run = { ...base, status: 'paid-only' as const, detail: error.message, passed: 0, results: [] };
        store.record(target, run);
        return run;
      }
      results.push({ scenario: account, expected: { before: expectedOf(before) }, observed: null, excerpt: null, pass: false, outcome: 'unreadable', reason: `No answer: ${(error as Error).message}`, latencyMs: null });
    }
  }
  const run = { ...base, status: 'checked' as const, detail: null, passed: results.filter((r) => r.pass).length, results };
  store.record(target, run);
  return run;
}

/**
 * Check the health factor agents that are due, a bounded number per sweep:
 * never checked first, then the longest since their last check. At most
 * two per run, so a sweep every two hours checks each listed agent about
 * every other day.
 */
export async function runDueHealthFactorChecks(
  agents: Array<{ chainId: number; tokenId: string }>,
  { limit = 2, now = Date.now(), startWithinMs = 60_000 }: { limit?: number; now?: number; startWithinMs?: number } = {},
): Promise<{ checked: number; passedAll: number; notAskable: number; paidOnly: number; sample: number }> {
  const store = getAssayStore();
  const due = dueForCheck(
    agents,
    { lastRun: store.lastRunAt(HF_SUITE_ID), lastAttempt: store.lastFailedAttemptAt(HF_SUITE_ID) },
    { now, recheckMs: RECHECK_MS, retryMs: RETRY_MS, limit },
  );
  if (due.length === 0) return { checked: 0, passedAll: 0, notAskable: 0, paidOnly: 0, sample: 0 };
  const accounts = await currentSample();
  if (accounts.length === 0) return { checked: 0, passedAll: 0, notAskable: 0, paidOnly: 0, sample: 0 };
  let checked = 0;
  let passedAll = 0;
  let notAskable = 0;
  let paidOnly = 0;
  // The sweep shares one time budget, so no new agent starts late in it.
  const started = Date.now();
  for (const agent of due) {
    if (Date.now() - started > startWithinMs) break;
    const run = await runHealthFactorSuite(agent, accounts).catch((error: unknown) => {
      // No result to show, but the attempt is the agent's turn: without this
      // the same failing agents led the queue every sweep.
      store.noteFailedAttempt(agent, HF_SUITE_ID, (error as Error).message ?? String(error));
      return null;
    });
    if (!run) continue;
    checked += 1;
    if (run.status === 'not-askable') notAskable += 1;
    else if (run.status === 'paid-only') paidOnly += 1;
    else if (run.passed === run.total) passedAll += 1;
  }
  return { checked, passedAll, notAskable, paidOnly, sample: accounts.length };
}
