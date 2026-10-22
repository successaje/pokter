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
  assert.match(flow, /hire\.reviewQuote\?\.request\.subject/);
  assert.match(flow, /What it will be asked/);
  assert.match(flow, /Your brief is sent whole alongside it/);

  const hook = code('lib/hire/useHire.ts');
  assert.match(hook, /const request: SkillRequestPreview = payload\.request/);
  assert.match(hook, /^\s*request,$/m, 'carried on the quote the review step reads');
});
