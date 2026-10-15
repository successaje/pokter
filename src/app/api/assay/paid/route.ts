import { NextResponse } from 'next/server';

import { STATIC_SUITES, type StaticAssayCategory } from '@/lib/assay/category-suites';
import { checkBrief, hfCheckBrief } from '@/lib/assay/paid-brief';
import { fixtureJobsForAgent, gradePaidCategoryCheck, gradePaidHealthFactorCheck } from '@/lib/assay/paid-run';
import { HF_SUITE_ID } from '@/lib/assay/health-factor';
import { currentSample } from '@/lib/assay/run';
import { hireAgent } from '@/lib/erc8183/hire';
import { encodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Hire an agent's published fixtures so its work can be graded.
 *
 * Pokter's correctness check asked agents for free. An agent that does its
 * work only when paid answers that with a price, records `paid-only`, and
 * can never pass — so the agents with real customers were exactly the ones
 * Pokter could not check. This pays for the answer instead, and the sweep
 * grades whatever has been delivered (`gradeDuePaidChecks`).
 *
 * A route rather than a script because the stores and the escrow client are
 * both `server-only`, and satisfying that under tsx needs
 * `--conditions=react-server`, which makes the Altana SDK resolve as CJS
 * and throw (issue #88). This also puts funding behind the operator secret
 * and a dry run, like `/api/corrections`.
 *
 * Each scenario becomes its own ERC-8183 job whose task carries the
 * scenario id, so which fixture a job answered is readable on chain by
 * anyone — which is the point: the resulting check is verifiable without
 * Pokter's database.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    agent?: unknown;
    category?: unknown;
    budgetU?: unknown;
    apply?: unknown;
  };

  const agentKey = typeof body.agent === 'string' ? body.agent : '';
  const category = body.category as StaticAssayCategory | 'health-factor';
  if (!/^\d{1,10}:\d{1,12}$/.test(agentKey)) {
    return NextResponse.json({ error: 'agent must be "<chainId>:<tokenId>".' }, { status: 400 });
  }
  if (typeof category !== 'string' || !(category === 'health-factor' || category in STATIC_SUITES)) {
    return NextResponse.json({ error: `category must be health-factor or one of ${Object.keys(STATIC_SUITES).join(', ')}.` }, { status: 400 });
  }
  const budgetU = typeof body.budgetU === 'number' && body.budgetU > 0 && body.budgetU <= 5 ? body.budgetU : 0.1;
  const apply = body.apply === true;

  /*
   * Mainnet fixtures spend real money, and a correctness check is not worth
   * funding by accident. Testnet is the default home for these.
   */
  if (apply && ALTANA_NETWORK.chainId === 56 && process.env.ASSAY_PAID_ALLOW_MAINNET !== '1') {
    return NextResponse.json({ error: 'Refusing to fund fixture hires on mainnet. Set ASSAY_PAID_ALLOW_MAINNET=1 to allow it.' }, { status: 400 });
  }

  const [chainText, tokenId] = agentKey.split(':');
  const chainId = Number(chainText);
  const live = category === 'health-factor';
  /*
   * A health-factor fixture is a real Venus borrower, drawn from the same
   * weekly sample the free check uses so both ask about the same positions.
   * The static suites carry their scenarios with them.
   */
  const scenarios = live
    ? (await currentSample().catch(() => [])).map((account) => ({ id: account.toLowerCase(), task: hfCheckBrief(account)?.task ?? null }))
    : STATIC_SUITES[category].scenarios.map((scenario) => ({ id: scenario.id, task: checkBrief(category as StaticAssayCategory, scenario.id)?.task ?? null }));
  const suite = live
    ? { id: HF_SUITE_ID, label: 'Health factor check', scenarios: scenarios.length }
    : { id: STATIC_SUITES[category].id, label: STATIC_SUITES[category].label, scenarios: scenarios.length };

  if (scenarios.length === 0) {
    return NextResponse.json({ error: 'No fixtures to hire: Venus borrowers could not be sampled.' }, { status: 503 });
  }

  const agent = await getAgent(chainId as ChainId, tokenId).catch(() => null);
  if (!agent) return NextResponse.json({ error: `Could not read agent ${agentKey} from the registry.` }, { status: 404 });

  const provider = (agent.agent_wallet ?? agent.owner_address) as `0x${string}` | undefined;
  if (!provider) return NextResponse.json({ error: 'The agent publishes no wallet an escrow could pay.' }, { status: 400 });

  // What is already hired, so a re-run tops up rather than paying twice.
  const already = fixtureJobsForAgent({ chainId, tokenId }, suite.id);
  const todo = scenarios.filter((scenario) => !already.has(scenario.id));

  const funded: Array<{ scenario: string; jobId?: string; error?: string }> = [];
  if (apply) {
    for (const scenario of todo) {
      if (!scenario.task) continue;
      try {
        /*
         * The envelope goes on chain; the fixture stays the task. A raw
         * brief written as the description is not a `pokter-job` envelope,
         * so `jobIdentity` does not recognise it — by design, so another
         * marketplace's jobs cannot be counted as Pokter hires — and the
         * job can never be indexed, noticed or delivered. Two fixtures
         * were funded that way and could not complete.
         */
        const description = encodePokterJobEnvelope({
          identityChainId: chainId,
          agentTokenId: tokenId,
          agentName: agent.name ?? undefined,
          category,
          provider,
          task: scenario.task,
        });
        const job = await hireAgent({ agentTokenId: tokenId, agentChainId: chainId, agentName: agent.name ?? agentKey, provider, task: scenario.task, description, budgetU });
        funded.push({ scenario: scenario.id, jobId: job.jobId });
      } catch (error) {
        funded.push({ scenario: scenario.id, error: (error as Error).message });
      }
    }
  }

  /*
   * Graded now in case the fixtures were hired earlier and have since been
   * delivered. Jobs funded in this request will not have delivered yet; the
   * sweep picks them up.
   */
  const outcome = live
    ? await gradePaidHealthFactorCheck({ chainId, tokenId })
    : gradePaidCategoryCheck({ chainId, tokenId }, category as StaticAssayCategory);

  return NextResponse.json({
    agent: agentKey,
    name: agent.name,
    suite,
    escrowChainId: ALTANA_NETWORK.chainId,
    mode: apply ? 'applied' : 'dry-run',
    alreadyHired: [...already.entries()].map(([scenario, job]) => ({ scenario, jobId: job.jobId, status: job.status })),
    wouldHire: apply ? [] : todo.map((scenario) => scenario.id),
    funded,
    grading:
      outcome.state === 'recorded'
        ? { state: outcome.state, passed: outcome.run.passed, total: outcome.run.total, via: outcome.run.via, results: outcome.run.results.map((r) => ({ scenario: r.scenario, jobId: r.jobId, pass: r.pass, outcome: r.outcome, reason: r.reason })) }
        : outcome,
  });
}
