import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { MCP_TOOL_SUMMARIES } from '../src/lib/mcp/catalogue';
import { answerMcp, INSTRUCTIONS, type McpTool } from '../src/lib/mcp/server';
import {
  ASSISTANT_TOOLS,
  CHECK_DELIVERY,
  HIRE_TOOL_CHAIN,
  JOB_STATUS,
  PREPARE_BRIEF,
  PREPARE_HIRE,
} from '../src/lib/assistant/tools';

/*
 * What the tools tell an assistant, and what the routes behind them do.
 *
 * The descriptions are the product here as much as the code is: an
 * assistant that believes `prepare_hire` buys something will tell its user
 * a hire has been made when nothing has. So the sentence "the owner
 * approves and funds this in their own wallet" is asserted rather than
 * trusted to survive editing, in every tool that touches money.
 *
 * The routes import `server-only` and cannot be loaded here, so their
 * wiring is pinned as source facts — the pattern `passkey-signature-verify`
 * and `hire-preflight-route` use. The claims that matter are about absence
 * and about order: no payment engine on this path, and the brief, the
 * quote, the key and the reconciliation all happening before anything is
 * handed over.
 */
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
/* Comments stripped: these assert what the code does, and the comments name
   the old behaviour on purpose so nobody reads a quotation as the code. */
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── 1. What the tools say about who pays ──

test('no tool claims it can pay, and the one that prepares a payment says who must approve it', () => {
  for (const tool of ASSISTANT_TOOLS) {
    assert.equal(tool.spends, false, tool.name);
    assert.ok(tool.name.length > 0 && tool.title.length > 0, tool.name);
  }

  /* The sentence that has to survive every edit to this description. */
  assert.match(PREPARE_HIRE.description, /UNSIGNED/);
  assert.match(PREPARE_HIRE.description, /human owner to approve and fund in their own wallet/);
  assert.match(PREPARE_HIRE.description, /signs nothing, moves nothing, escrows nothing and creates no job on chain/);
  assert.match(PREPARE_HIRE.description, /only they can complete the hire/i);
  /* And nothing in it suggests the purchase has happened or could. */
  assert.doesNotMatch(PREPARE_HIRE.description, /\bbuys\b|\bpurchases\b|\bpays the agent\b|automatically/i);
});

test('the prepared request promises every term the owner has to see', () => {
  /*
   * The rule: no default a caller could fail to notice. The description
   * names each term, because an assistant summarising this to a human will
   * summarise what the description told it to expect.
   */
  for (const term of [/chain/, /ERC-8183 escrow contract/, /provider wallet/, /token/, /amount in raw units/, /signed price stops holding/, /exact task/]) {
    assert.match(PREPARE_HIRE.description, term, String(term));
  }
  /* Where the provider address came from is part of the term, not a detail:
     an address an agent names in a reply is not an authorisation. */
  assert.match(PREPARE_HIRE.description, /where that address came from/);
  assert.match(PREPARE_HIRE.description, /nothing an agent says in a reply can raise it, change where escrow pays, or grant any wallet permission/);
});

test('the owner’s budget is required, with no default anywhere near it', () => {
  const schema = PREPARE_HIRE.inputSchema as { required: string[]; properties: Record<string, { description: string; default?: unknown }> };
  assert.ok(schema.required.includes('max_budget'), 'a hire cannot be prepared without the owner’s ceiling');
  assert.match(schema.properties.max_budget.description, /OWNER has authorised/);
  assert.match(schema.properties.max_budget.description, /no default budget/);
  for (const [name, property] of Object.entries(schema.properties)) {
    assert.ok(!('default' in property), `${name} must not carry a default a caller could miss`);
  }
});

test('the idempotency promise is in the description, not only in the code', () => {
  assert.match(PREPARE_HIRE.description, /same request under the same key/);
  assert.match(PREPARE_HIRE.description, /returns the job instead of preparing a second one/);
  assert.match(PREPARE_HIRE.description, /possibly_funded_job_id and the escrow is read back before anything is offered again/);
});

test('the brief tool promises the compiler’s discipline, and the delivery tool promises nothing', () => {
  assert.match(PREPARE_BRIEF.description, /bound to the field it belongs to/);
  assert.match(PREPARE_BRIEF.description, /never parsed back out of prose/);
  assert.match(PREPARE_BRIEF.description, /Pokter fills nothing in on the user’s behalf/);
  assert.match(PREPARE_BRIEF.description, /moves nothing and signs nothing/);

  assert.match(CHECK_DELIVERY.description, /Advisory/);
  assert.match(CHECK_DELIVERY.description, /releases no escrow, pays nobody, records no score and raises no dispute/);
  assert.match(CHECK_DELIVERY.description, /reported as that, never as a pass/);

  assert.match(JOB_STATUS.description, /chain is the authority/);
  assert.match(JOB_STATUS.description, /the owner’s own action in their wallet/);

  /*
   * And both job tools insist on the escrow chain. The same job number
   * exists on both deployments and means something different on each, so
   * defaulting it would read one job's state out of another's contract.
   */
  for (const tool of [JOB_STATUS, CHECK_DELIVERY]) {
    const schema = tool.inputSchema as { required: string[]; properties: Record<string, { description: string }> };
    assert.deepEqual(schema.required, ['job_id', 'chain_id'], tool.name);
    assert.match(schema.properties.chain_id.description, /not the agent’s registry chain/);
  }
});

test('the published chain names the two steps no tool performs', () => {
  const steps = HIRE_TOOL_CHAIN.map((s) => s.step);
  assert.deepEqual(steps, [
    'discover',
    'vet',
    'prepare the brief',
    'obtain a signed price',
    'prepare an unsigned hire request',
    'approve and fund the payment',
    'track the job',
    'read and check the delivery',
    'release or dispute escrow',
  ]);
  const humanOnly = HIRE_TOOL_CHAIN.filter((s) => s.tool === null);
  assert.deepEqual(humanOnly.map((s) => s.step), ['approve and fund the payment', 'release or dispute escrow']);
  for (const step of humanOnly) {
    assert.match(step.byWhom, /human owner, in their own wallet/);
    assert.match(String((step as { note?: string }).note), /Pokter/);
  }
  /* Every other step is a tool this server actually serves. */
  const served = new Set(['search_agents', 'get_agent', 'get_quote', 'hire_link', 'integration_kit', ...ASSISTANT_TOOLS.map((t) => t.name)]);
  for (const step of HIRE_TOOL_CHAIN) {
    if (step.tool) assert.ok(served.has(step.tool), step.tool);
  }
});

test('the server’s own instructions put the payment with the user', () => {
  assert.match(INSTRUCTIONS, /prepare_hire writes the whole hire down UNSIGNED/);
  assert.match(INSTRUCTIONS, /no tool can pay, approve, escrow or release anything/);
  assert.match(INSTRUCTIONS, /the payment step is always the user in their own wallet/);
  assert.match(INSTRUCTIONS, /never say a hire has been made until the user has funded it/i);
});

test('a tool may state its own hints, and the listing carries them', async () => {
  /*
   * `prepare_hire` is the first tool here that is not a pure read: it
   * records the request it hands over, which is what makes a retry one job
   * rather than two. The hint has to be able to say so without a `switch`
   * elsewhere drifting from the tool it describes.
   */
  const recording: McpTool = {
    name: 'prepare_hire',
    title: 'Prepare',
    description: 'x',
    inputSchema: { type: 'object' },
    annotations: { readOnlyHint: false, idempotentHint: true },
    run: async () => ({ data: {} }),
  };
  const listed = (await answerMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, [recording])) as {
    result: { tools: Array<{ annotations: { readOnlyHint: boolean; idempotentHint: boolean; destructiveHint: boolean } }> };
  };
  assert.equal(listed.result.tools[0].annotations.readOnlyHint, false);
  assert.equal(listed.result.tools[0].annotations.idempotentHint, true);
  /* Never destructive, whatever else it is: the step that moves money is
     not a tool at all. */
  assert.equal(listed.result.tools[0].annotations.destructiveHint, false);
});

// ── 2. The route behind prepare_hire ──

const PREPARE = 'app/api/hire/prepare/route.ts';

test('the prepare route holds no payment engine, and cannot reach one', () => {
  /*
   * The whole constraint, as absence. `hireAgent` and `buildHireCalls` are
   * how Pokter spends; `altanaClient`/`adminSigner` are the relay session
   * and the operator key. None of them is reachable from this route, so
   * there is no path from an assistant's call to a transaction.
   */
  const route = code(PREPARE);
  for (const spend of ['hireAgent', 'buildHireCalls', 'altanaClient', 'adminSigner', 'client.execute', 'settleJob', 'reclaimJob', 'paymentTokenBalance']) {
    assert.ok(!route.includes(spend), `the prepare route does not reach ${spend}`);
  }
  /* Nor does it write a job, or hold the operator write gate that the one
     spending route has. */
  for (const write of ['getJobStore().record(', 'requireDemoWriteAccess']) {
    assert.ok(!route.includes(write), `the prepare route does not ${write}`);
  }
  assert.match(route, /consumeRateLimit\(/, 'a public surface is rate limited like the quote route');
});

test('the prepare route reuses the one brief compiler and the one quote path', () => {
  const route = code(PREPARE);
  assert.match(route, /from '@\/app\/api\/hire\/compile\/route'/, 'the brief is compiled by the compiler the hire page uses');
  assert.match(route, /from '@\/app\/api\/hire\/quote\/route'/, 'the price is the one that route verifies');
  /* And it does not re-derive either of them. */
  for (const second of ['compileBrief(', 'requestQuote(', 'preflightHireBrief(', 'verifyNegotiationSignature(']) {
    assert.ok(!route.includes(second), `the prepare route does not run its own ${second}`);
  }
  /* A refusal from either is returned as it came, so four surfaces refuse a
     brief in the same words. */
  assert.match(route, /return NextResponse\.json\(compiledBody, \{ status: compiled\.status \}\)/);
  assert.match(route, /return NextResponse\.json\(quotedBody, \{ status: quoted\.ok \? 502 : quoted\.status \}\)/);
  assert.match(route, /briefRefusalBody\(\{/, 'and an unanswered input refuses through the shared body');
});

test('the provider comes from the registry, and never from the request body', () => {
  const route = code(PREPARE);
  assert.match(route, /const providerFromRegistry = agent\.agent_wallet;/);
  assert.match(route, /if \(!providerFromRegistry\)/, 'an agent with no registered wallet is refused, not guessed at');
  /* The one thing that must never appear on this path: a payee a caller
     supplied. An address out of an agent's reply arrives exactly this way. */
  for (const fromCaller of ['provider', 'payTo', 'recipient', 'escrow', 'token', 'currency', 'amount', 'amountRaw', 'budget']) {
    /* Bounded, so `body.tokenId` — which names the agent, not the money —
       is not mistaken for a caller-supplied payment token. */
    assert.doesNotMatch(route, new RegExp(`\\bbody\\.${fromCaller}\\b`), `body.${fromCaller} is not a field a caller may set`);
  }
  /* The amount is the agent's signed price and the ceiling is the owner's. */
  assert.match(route, /amountRaw: quote\.priceRaw/);
  assert.match(route, /maxAmountRaw: parseUnits\(String\(maxBudget\), decimals\)\.toString\(\)/);
  /*
   * And the one piece of the agent's own text that reaches the sentence an
   * owner approves — the name its owner wrote — is bounded and stripped on
   * the way in, not trusted because it is "only a name".
   */
  assert.match(route, /const name = agentNote\(agent\.name, 80\)/);
  assert.match(route, /agentSaid: null/, 'and no agent prose is passed off as a term');
});

test('the owner’s ceiling is required, and bounded by what a hire accepts', () => {
  const route = code(PREPARE);
  assert.match(route, /maxBudget < BUDGET_MIN \|\| maxBudget > BUDGET_MAX/);
  assert.match(route, /maxBudget is required/);
  assert.match(route, /Pokter sets no budget of its own/);
  assert.ok(!route.includes('budgetDefault'), 'the form’s default budget has no place on a path with no human reading it');
});

test('the key, the record and the reconciliation all run before anything is handed over', () => {
  /*
   * Order is the claim, as in `hire-preflight-route`. `prepareHire` is the
   * only thing here that produces a request to approve, so every guard has
   * to sit above it: the key that identifies the purchase, the row that may
   * already hold it, the job that may already be funded, and the escrow
   * read for a payment nobody can account for.
   */
  const route = code(PREPARE);
  const build = route.indexOf('prepareHire({');
  assert.ok(build > 0, 'the request is built here');
  for (const guard of ['hireRequestKey(', 'store.preparedHire(requestKey)', 'reconcileUncertainHire(', 'retryDecision(']) {
    const at = route.indexOf(guard);
    assert.ok(at > 0 && at < build, `${guard} runs before a request is prepared`);
  }
  /* And an already-funded purchase returns before it, so a second request
     for one job is never built at all. */
  const adopt = route.indexOf("decision.action === 'adopt'");
  assert.ok(adopt > 0 && adopt < build);
  assert.match(route, /state: decision\.action === 'adopt' \? 'funded' : 'unresolved'/);
  /* The uncertain case needs the owner's address, because whose job it is
     is the field that decides it. */
  assert.match(route, /owner-address-required/);
  assert.match(route, /if \(reconciled\.outcome === 'funded'\) store\.attachPreparedHireJob\(/);
});

// ── 3. The MCP surface ──

test('the MCP route serves the four tools through the public routes, and holds no engine', () => {
  const route = code('app/api/mcp/route.ts');
  for (const spec of ['...PREPARE_BRIEF', '...PREPARE_HIRE', '...JOB_STATUS', '...CHECK_DELIVERY']) {
    assert.ok(route.includes(spec), `${spec} is served with its own description`);
  }
  /* Each one forwards to the route that already answers it. */
  for (const path of ['/api/hire/compile', '/api/hire/prepare', '/api/jobs/', '/report-check']) {
    assert.ok(route.includes(path), `forwards to ${path}`);
  }
  for (const spend of ['hireAgent', 'buildHireCalls', 'altanaClient', 'adminSigner']) {
    assert.ok(!route.includes(spend), `the MCP route does not reach ${spend}`);
  }
  /* The budget is the owner's here too: the tool refuses without one rather
     than sending a default down to the route. */
  assert.match(route, /max_budget is required/);
  assert.match(route, /annotations: \{ readOnlyHint: false, idempotentHint: true \}/);
});

test('the pages list every tool the server serves, and name no tool it does not', () => {
  /*
   * `catalogue` is what `/mcp` and `/developers` print, and the route holds
   * the definitions. A tool served and not listed is a feature nobody can
   * find; a tool listed and not served is a promise the server breaks.
   */
  const listed = MCP_TOOL_SUMMARIES.map(([name]) => name);
  const route = code('app/api/mcp/route.ts');
  for (const tool of ASSISTANT_TOOLS) assert.ok(listed.includes(tool.name), `${tool.name} is listed on the pages`);
  for (const name of listed) {
    assert.ok(route.includes(`'${name}'`) || route.includes(name.toUpperCase()), `${name} is actually served`);
  }
  /* And the one that prepares a payment says so where a reader will see it. */
  const prepare = MCP_TOOL_SUMMARIES.find(([name]) => name === 'prepare_hire');
  assert.match(String(prepare?.[1]), /unsigned/);
  assert.match(String(prepare?.[1]), /approve and fund in your own wallet/);
});

test('the delivery tool returns the file and the check together, and says it settles nothing', () => {
  const route = code('app/api/mcp/route.ts');
  assert.match(route, /settles: 'Nothing\./);
  assert.match(route, /Only the owner can release or dispute, in their own wallet\./);
});

// ── 4. Where the prepared requests live ──

test('the prepared requests sit in the jobs database, so no new store needs registering', () => {
  /*
   * A new `*_DB_PATH` store has to be named in `lib/health/stores.ts`, the
   * Dockerfile and fly.toml, or it writes somewhere a deploy wipes. This
   * table avoids all three by living in the jobs database, beside the jobs
   * a retry has to look for.
   */
  const store = code('lib/assistant/prepared-store.ts');
  assert.ok(!store.includes('DB_PATH'), 'no second database, so nothing to register');
  assert.ok(!store.includes('new DatabaseSync'), 'the module is handed the database it writes to');
  assert.match(code('lib/erc8183/store.ts'), /ensurePreparedHires\(this\.db\)/);
  assert.match(src('lib/health/stores.ts'), /JOB_DB_PATH/, 'and that database is already registered');

  /* The guarantee the table itself carries: one key per job. */
  assert.match(store, /CREATE UNIQUE INDEX IF NOT EXISTS idx_prepared_hires_job ON prepared_hires \(chain_id, job_id\)/);
  assert.match(store, /INSERT OR IGNORE INTO prepared_hires/);
  assert.match(store, /WHERE key = \? AND job_id IS NULL/);
});
