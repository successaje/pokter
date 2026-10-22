import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { briefRefusalBody, skillRequestData } from '../src/lib/erc8183/skill-request';
import { registryIdentityFrom } from '../src/lib/hire/registry-identity';

/*
 * The hire route, at the point where it decides to spend.
 *
 * `hireAgent` and both route handlers import `server-only`, so nothing here
 * can call them: the decisions they make live in pure modules and are
 * exercised directly, and the order they are made in — the part that makes
 * "before anything is spent" true — is pinned as a source fact, the way
 * `passkey-signature-verify` and `reconcile-outcomes` pin theirs. Exercising
 * the handler itself would need the operator secret, a funded wallet and a
 * live registry read.
 */
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
/* Comments stripped: these assert what the code does, and the comments name
   the old behaviour on purpose so nobody reads a quotation as the code. */
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const job = JSON.parse(readFileSync('tests/fixtures/job-1585.json', 'utf8')) as { description: string };
const task = (JSON.parse(job.description) as { task: string }).task;

test('the registry identity the envelope is written for is the one that is forwarded', () => {
  /*
   * Job 1585's own hire shape. The route validated this pair to write the
   * envelope and then dropped the chain, so the row stored NULL and the
   * preflight could not read the agent's skills on the path that funded it.
   */
  assert.deepEqual(registryIdentityFrom({ agentTokenId: '2599', identityChainId: 97 }), {
    identityChainId: 97,
    agentTokenId: '2599',
  });
  // A JSON body carries numbers as strings often enough to matter.
  assert.deepEqual(registryIdentityFrom({ agentTokenId: '2599', identityChainId: '97' }), {
    identityChainId: 97,
    agentTokenId: '2599',
  });
});

test('no registration means no forwarded chain, and no envelope', () => {
  /*
   * The unregistered reference seller is hired with a non-numeric token id
   * and reads a raw description. Nothing about it is a registration, and
   * inventing a chain for it would file the hire under the wrong registry —
   * which is why `agentChainId` is never defaulted to the escrow chain.
   */
  for (const input of [
    { agentTokenId: 'reference', identityChainId: 97 },
    { agentTokenId: '', identityChainId: 97 },
    { agentTokenId: '2599', identityChainId: 0 },
    { agentTokenId: '2599', identityChainId: -97 },
    { agentTokenId: '2599', identityChainId: 'ninety-seven' },
    { agentTokenId: '2599', identityChainId: Number.MAX_SAFE_INTEGER + 2 },
    { agentTokenId: '2599' },
    {},
  ]) {
    assert.equal(registryIdentityFrom(input), null, JSON.stringify(input));
  }
});

test('a brief naming no evidence subject is refused with the body both routes return', () => {
  const request = skillRequestData({
    skillId: 'agent_evidence',
    task: 'Tell me whether this agent is worth hiring.',
  });
  assert.equal(request.ok, false);
  if (request.ok) return;

  const body = briefRefusalBody({
    message: request.message,
    code: request.code,
    skill: 'agent_evidence',
    candidates: request.candidates,
  });
  assert.deepEqual(body, {
    error: request.message,
    layer: 'input',
    code: 'subject-missing',
    retryable: false,
    skill: 'agent_evidence',
  });
  // `useHire` reads `layer` to say the brief is the thing to fix.
  assert.equal(body.layer, 'input');
  assert.ok(!('candidates' in body), 'nothing to list when nothing was named');
});

test('a brief naming two evidence subjects is refused and both are returned', () => {
  const request = skillRequestData({
    skillId: 'agent_evidence',
    task: 'Compare 97/2618 with 97/2554 and say which answers more often.',
  });
  assert.equal(request.ok, false);
  if (request.ok) return;

  const body = briefRefusalBody({
    message: request.message,
    code: request.code,
    skill: 'agent_evidence',
    candidates: request.candidates,
  });
  assert.equal(body.code, 'subject-ambiguous');
  assert.equal(body.retryable, false, 'retrying the same brief asks the same unanswerable question');
  assert.deepEqual((body.candidates as string[]).sort(), ['97/2554', '97/2618']);
});

test('job 1585’s brief is not refused: the gate stops bad briefs, not this one', () => {
  const request = skillRequestData({ skillId: 'agent_evidence', task });
  assert.equal(request.ok, true, request.ok ? '' : `refused: ${request.code}`);
});

test('/api/hire forwards the identity it validated, into the call that spends', () => {
  const route = code('app/api/hire/route.ts');
  assert.match(route, /const identity = registryIdentityFrom\(body\)/);
  // Read once and used for both, so the envelope and the preflight agree.
  assert.match(route, /identityChainId: identity\.identityChainId/);
  const forward = route.indexOf('agentChainId: identity.identityChainId');
  const hire = route.indexOf('await hireAgent({');
  assert.ok(forward > hire && forward > 0, 'the chain is passed to hireAgent');
});

test('the preflight runs before anything is spent', () => {
  /*
   * Order is the whole claim. `altanaClient()` is the first thing that can
   * cost: it is the relay session the five hire calls are batched through.
   * The gate sits above it, so a brief that cannot be delivered never
   * reaches a wallet, a balance check or a transaction.
   */
  const hire = code('lib/erc8183/hire.ts');
  const gate = hire.indexOf('preflightHireBrief');
  for (const spend of ['altanaClient()', 'paymentTokenBalance(', 'buildHireCalls(', 'client.execute(']) {
    const at = hire.indexOf(spend);
    assert.ok(at > 0, `${spend} is still how a hire spends`);
    assert.ok(gate > 0 && gate < at, `the preflight runs before ${spend}`);
  }
});

test('the quote route refuses before it asks the seller to sign', () => {
  /*
   * A quote is the seller's signature over this exact brief. Asking for one
   * Pokter already knows it cannot deliver spends the seller's time and
   * hands the buyer something to fund.
   */
  const route = code('app/api/hire/quote/route.ts');
  const gate = route.indexOf('preflightHireBrief');
  const ask = route.indexOf('await requestQuote(');
  const record = route.indexOf('recordQuoteIntent');
  assert.ok(gate > 0 && ask > 0 && gate < ask, 'the preflight runs before the seller is asked');
  assert.ok(gate < record, 'and before a quote intent is recorded');
});

test('both hire surfaces refuse through the same body', () => {
  for (const path of ['app/api/hire/route.ts', 'app/api/hire/quote/route.ts']) {
    assert.match(code(path), /briefRefusalBody\(\{/, path);
  }
});

test('the review step shows the subject from the quote, so a brief edit clears it', () => {
  /*
   * `reviewQuote` is null unless the quote was taken for the task as
   * written, so reading the subject from it is what keeps the screen from
   * describing a request Pokter would no longer make.
   */
  const flow = src('features/hire/HireFlow.tsx');
  assert.match(flow, /hire\.reviewRequest\?\.subject/);
  assert.match(flow, /What \{props\.agent\.name\} will be asked/);
  assert.match(flow, /Your brief is sent whole alongside it/);

  const hook = code('lib/hire/useHire.ts');
  assert.match(hook, /const reviewRequest = preRequest && preRequest\.task === task/);
  assert.match(hook, /^\s*reviewRequest,$/m, 'exposed to the screen that reads it');
});

test('the hire with no quote is checked too, by the same preflight', () => {
  /*
   * `needsQuote` is false when Pokter's seller carries the brief, so
   * `negotiateForHire` never runs and nothing checked the brief before the
   * escrow was funded. `/api/hire/preflight` answers the same question for
   * that path, through the same `preflightHireBrief` and the same refusal
   * body as the other two surfaces.
   */
  const route = code('app/api/hire/preflight/route.ts');
  assert.match(route, /preflightHireBrief\(\{/);
  assert.match(route, /briefRefusalBody\(\{/);
  // Read-only: it reads the agent and its card and writes nothing.
  for (const write of ['recordQuoteIntent', 'hireAgent', 'buildHireCalls', 'requireDemoWriteAccess']) {
    assert.ok(!route.includes(write), `the check does not ${write}`);
  }
  assert.match(route, /consumeRateLimit\(/, 'a public read is rate limited like the quote route');
});

test('all three hire surfaces refuse through one preflight and one body', () => {
  const surfaces = ['app/api/hire/quote/route.ts', 'app/api/hire/preflight/route.ts', 'lib/erc8183/hire.ts'];
  for (const path of surfaces) assert.match(code(path), /preflightHireBrief/, path);
  for (const path of ['app/api/hire/quote/route.ts', 'app/api/hire/preflight/route.ts', 'app/api/hire/route.ts']) {
    assert.match(code(path), /briefRefusalBody/, path);
  }
});

test('the no-quote path is refused before a wallet is touched', () => {
  /*
   * Order again. `prepareQuote` stops the buyer reaching Review, and
   * `commission` stops any other caller reaching a wallet: the check runs
   * in the branch for hires without a quote, above both funding routes.
   */
  const hook = code('lib/hire/useHire.ts');
  const inPrepare = hook.indexOf('await preflightBrief(agent.chainId, agent.tokenId, task)');
  assert.ok(inPrepare > 0, 'prepareQuote checks the brief');

  const gate = hook.lastIndexOf('await preflightBrief(agent.chainId, agent.tokenId, task)');
  assert.ok(gate > inPrepare, 'and commission checks it again for any other caller');
  for (const fund of ['hireFromExternalWallet(', "active.mode === 'external'"]) {
    const at = hook.indexOf(fund);
    assert.ok(at > 0 && gate < at, `the check runs before ${fund}`);
  }
});

test('a brief edit clears the resolved request on both paths', () => {
  /*
   * One state, set by the quote path and the no-quote path alike, and read
   * back only while the task and provider it was resolved for are still the
   * ones in the form.
   */
  const hook = code('lib/hire/useHire.ts');
  assert.match(hook, /const reviewRequest = preRequest && preRequest\.task === task && preRequest\.provider === providerAddress/);
  assert.match(hook, /setPreRequest\(\{ request: quote\.request, task, provider: providerAddress, escrowChainId \}\)/);
  assert.match(hook, /setPreRequest\(null\)/, 'cleared when the check refuses');
});

test('a refusal body says which layer refused, and never blames the wrong one', () => {
  /*
   * Pokter failing to turn a brief into a request is the brief's shape.
   * The agent declining the work is the agent's own judgement, and
   * reporting that as `layer: "input"` would blame the buyer's wording for
   * someone else's decision — `useHire` reads this to decide what to say.
   */
  const declined = briefRefusalBody({
    message: 'Venus Yield Keeper declined this brief: “needs the token address”',
    code: 'brief-declined',
    skill: 'lp_tier_plan',
  });
  assert.equal(declined.layer, 'seller');
  assert.equal(declined.code, 'brief-declined');
  assert.equal(declined.retryable, false);
  assert.ok(!('candidates' in declined));

  for (const code of ['subject-missing', 'subject-ambiguous'] as const) {
    assert.equal(briefRefusalBody({ message: 'x', code, skill: 'agent_evidence' }).layer, 'input');
  }
});

test('a skill Pokter cannot name still carries a refusal', () => {
  /*
   * The agent-asked check covers skills Pokter has no adapter for, and for
   * most of the catalogue it cannot resolve a skill id at all. A null skill
   * is reported as null rather than suppressing the refusal.
   */
  const body = briefRefusalBody({ message: 'Agent #2554 declined this brief: “no”', code: 'brief-declined', skill: null });
  assert.equal(body.skill, null);
  assert.equal(body.layer, 'seller');
});

test('the agent is asked on every funding path that has no price to ask for', () => {
  /*
   * The quote route asks as part of getting a signed price, so it is
   * already covered. The two paths that never asked are the seller-carried
   * hire and the operator route — the one that funded job 1585.
   */
  for (const path of ['app/api/hire/preflight/route.ts', 'lib/erc8183/hire.ts']) {
    assert.match(code(path), /askIfAgentTakesBrief\(/, path);
  }
  assert.match(code('app/api/hire/quote/route.ts'), /await requestQuote\(/, 'the quote route already asks');

  // And in hireAgent it runs before anything is spent, like the check above it.
  const hire = code('lib/erc8183/hire.ts');
  const ask = hire.indexOf('askIfAgentTakesBrief(');
  for (const spend of ['altanaClient()', 'buildHireCalls(', 'client.execute(']) {
    assert.ok(ask > 0 && ask < hire.indexOf(spend), `asked before ${spend}`);
  }
});

test('only an explicit decline blocks a hire', () => {
  /*
   * Most of the catalogue publishes no price skill at all — a survey of
   * every agent that has answered a probe or carries a signed price found
   * 22 of 26 publishing no input example and no machine-checkable contract.
   * Refusing everything Pokter cannot ask would stop far more hires than it
   * saves, so the check fails open on every outcome but a decline.
   */
  const acceptance = code('lib/erc8183/brief-acceptance.ts');
  assert.match(acceptance, /if \(refusal\) return \{ ok: false/);
  assert.match(acceptance, /code === 'seller-declined' && reported\.sellerReason/);
  assert.match(acceptance, /return \{ ok: true, answered: quote !== null/);
  // "answered" and "could not be asked" stay separate facts, so an unchecked
  // brief is never reported as a checked one.
  assert.match(acceptance, /failure: quote === null \? \(reported\?\.code \?\? 'no-answer'\)/);
  // The price is an acceptance signal here, not a payment: it is not returned.
  assert.ok(!/priceU|priceRaw|negotiationHash/.test(acceptance), 'no price is carried out of the check');
});
