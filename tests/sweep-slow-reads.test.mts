import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/*
 * Two optional steps read hosts the sweep does not run: a mainnet node for
 * position-range grading, and the chain plus sellers' delivery hosts for
 * answered-task checks. When one of them is slow, each step spends its own
 * share and stops, and the steps after it still run.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('both steps have a cap of their own and are told when to stop', () => {
  const route = code('app/api/sweep/route.ts');
  assert.match(route, /const PAID_V3_STEP_MS = 20_000;/);
  assert.match(route, /const ANSWERED_TASKS_STEP_MS = 30_000;/);
  assert.match(route, /gradeDuePaidV3Checks\(\{ deadlineAt: Date\.now\(\) \+ Math\.min\(PAID_V3_STEP_MS, budget\.spendable\(\)\) - 2_000 \}\),\s*\{ maxMs: PAID_V3_STEP_MS \}/);
  assert.match(route, /checkAnsweredTasks\(\{ budgetMs: Math\.max\(0, Math\.min\(ANSWERED_TASKS_STEP_MS, budget\.spendable\(\)\) - 2_000\) \}\),\s*\{ maxMs: ANSWERED_TASKS_STEP_MS \}/);
});

test('a slow node gives up a call after 8s and tries once more', () => {
  assert.match(code('lib/assay/pancakeswap-v3.ts'), /http\(RPC_URL, \{ timeout: 8_000, retryCount: 1 \}\)/);
});

test('position-range grading starts no agent after its deadline', () => {
  const run = code('lib/assay/paid-run.ts');
  const loop = run.slice(run.indexOf('export async function gradeDuePaidV3Checks'));
  assert.ok(loop.indexOf('if (!mayStartSideEffect(deadlineAt)) break;') < loop.indexOf('await gradePaidV3Check(target)'));
});

test('every answered-task read is held to what is left, and a job cut short is not marked unreadable', () => {
  const sweep = code('lib/agent/answered-tasks-sweep.ts');
  const body = sweep.slice(sweep.indexOf('export async function checkAnsweredTasks'), sweep.indexOf('export function answeredTasksFor'));
  assert.match(body, /within\(getErc8183Job\(network, BigInt\(job\.jobId\)\), upTo\(10_000\)\)/);
  assert.match(body, /within\(deliverableUrlFromSubmit\(job\.chainId, job\.jobId\), upTo\(20_000\)\)/);
  assert.match(body, /\{ scanWindow: 5_000n, maxWindows: 300 \}\), upTo\(15_000\)\)/);
  assert.match(body, /readDelivery\(url, upTo\(10_000\)\)/);
  assert.ok(body.indexOf('if (!text && upTo(1) === 0) break;') < body.indexOf("verdict = text ? deliveryAnswered(text) : 'unreadable';"));
});
