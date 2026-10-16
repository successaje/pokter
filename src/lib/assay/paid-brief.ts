import type { HiredJob } from '@/lib/erc8183/types';

import { HF_SUITE_ID, hfBrief } from './health-factor';

import { STATIC_SUITES, type StaticAssayCategory } from './category-suites';

/**
 * A fixture brief that says, on chain, which published scenario it is.
 *
 * A paid check pays for one answer per scenario, so the grader has to know
 * which scenario a delivered artifact was answering. Nothing off-chain
 * needs to be trusted for that: the brief carries the suite and scenario
 * ids, and an ERC-8183 job's task text is already public, so anyone can
 * read the chain and see which fixture each job was asked. That is the
 * point of grading a paid hire rather than a free call — the evidence is
 * checkable by someone who does not have Pokter's database.
 *
 * The marker travels inside the task JSON rather than appended to prose.
 * Agents parse the task; a trailing "[pokter-check: …]" would reach the
 * model as part of the question and change the answer being graded.
 */

/** The key the marker travels under, inside the task envelope. */
export const CHECK_KEY = 'pokter_check';

export interface CheckMarker {
  suite: string;
  scenario: string;
}

/**
 * The task text for one scenario of one suite.
 *
 * The scenario's own brief is kept verbatim: it is the published fixture,
 * and a check that graded a reworded question would not be grading the
 * published scenario.
 */
export function checkBrief(
  category: StaticAssayCategory,
  scenarioId: string,
): { task: string; marker: CheckMarker } | null {
  const suite = STATIC_SUITES[category];
  if (!suite) return null;
  const scenario = suite.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return null;
  const marker: CheckMarker = { suite: suite.id, scenario: scenario.id };
  return {
    task: JSON.stringify({
      task: scenario.brief.text,
      data: scenario.brief.data,
      requested_by: 'Pokter correctness check',
      [CHECK_KEY]: marker,
    }),
    marker,
  };
}

/**
 * The marker in a job's task text, when it carries one.
 *
 * Returns null for every ordinary hire, which is most of them: a buyer's
 * own job must never be read as a fixture answer and graded against an
 * expected value it was never asked for.
 */
export function readCheckMarker(task: string | null | undefined): CheckMarker | null {
  if (typeof task !== 'string' || task.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(task);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const raw = (parsed as Record<string, unknown>)[CHECK_KEY];
  if (typeof raw !== 'object' || raw === null) return null;
  const { suite, scenario } = raw as Record<string, unknown>;
  if (typeof suite !== 'string' || typeof scenario !== 'string') return null;
  if (suite.length === 0 || scenario.length === 0) return null;
  return { suite, scenario };
}

/**
 * The newest fixture job per scenario, from one agent's jobs.
 *
 * Newest wins so a re-run after a fix supersedes the earlier attempt
 * rather than competing with it. A job with no marker is an ordinary
 * buyer's hire and is never considered — grading one against an expected
 * value it was never asked for would publish a failure the agent did not
 * earn.
 *
 * Here rather than beside the runner that uses it, because the runner
 * reads the job and deliverable stores and is `server-only`; choosing
 * which job answers which scenario is a pure decision and belongs where
 * tests can reach it.
 */
export function fixtureJobsBySuite(jobs: readonly HiredJob[], suiteId: string): Map<string, HiredJob> {
  const newest = new Map<string, HiredJob>();
  for (const job of jobs) {
    const marker = readCheckMarker(job.task);
    if (!marker || marker.suite !== suiteId) continue;
    const held = newest.get(marker.scenario);
    if (!held || Date.parse(job.hiredAt) > Date.parse(held.hiredAt)) newest.set(marker.scenario, job);
  }
  return newest;
}

/** The category whose suite has this id, for reading a marker back. */
export function categoryOfSuite(suiteId: string): StaticAssayCategory | null {
  const found = (Object.keys(STATIC_SUITES) as StaticAssayCategory[]).find((category) => STATIC_SUITES[category].id === suiteId);
  return found ?? null;
}

/**
 * A health-factor fixture brief, for a paid hire.
 *
 * The scenario id is the account, as in the free suite: a health-factor
 * agent is asked about one real Venus borrower at a time, and the account
 * is what distinguishes one scenario from another.
 *
 * The position is deliberately not attached. Brinkwatch and every other
 * agent in this category read the chain themselves, so a fixture that
 * supplied the rows would be checking arithmetic the agent never performs
 * — the mismatch that makes the static suites useless here. This asks the
 * declared service the question it declares it answers.
 */
export function hfCheckBrief(account: string): { task: string; marker: CheckMarker } | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(account)) return null;
  const brief = hfBrief(account);
  const marker: CheckMarker = { suite: HF_SUITE_ID, scenario: account.toLowerCase() };
  return {
    task: JSON.stringify({
      task: brief.text,
      data: brief.data,
      requested_by: 'Pokter correctness check',
      [CHECK_KEY]: marker,
    }),
    marker,
  };
}

/** The suite id for the paid position-range check. */
export const V3_SUITE_ID = 'v3-range-1';

/**
 * A position-range fixture: one wallet, asked the way the service asks.
 *
 * Centreline refuses a brief with no address, which is why the synthetic
 * portfolio-weight fixture could never reach it. The scenario is the
 * wallet; the answer is expanded into a row per position at grading time.
 */
export function v3CheckBrief(account: string): { task: string; marker: CheckMarker } | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(account)) return null;
  const marker: CheckMarker = { suite: V3_SUITE_ID, scenario: account.toLowerCase() };
  return {
    task: JSON.stringify({
      task:
        `Read-only check. For the BNB Chain wallet ${account}, list every PancakeSwap v3 position it holds — in the wallet or staked in the PancakeSwap farm — and say for each whether it is in range at the current price. Execute no transaction. Reply with JSON only.`,
      data: { suite: V3_SUITE_ID, account, wallet: account, address: account, protocol: 'pancakeswap-v3', chain_id: 56 },
      requested_by: 'Pokter correctness check',
      [CHECK_KEY]: marker,
    }),
    marker,
  };
}
