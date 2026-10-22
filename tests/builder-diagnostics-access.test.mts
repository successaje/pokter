import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { authoriseAgentOwner, isOwnershipProof } from '../src/lib/builder/diagnostics/authorise';
import { buildBuilderDiagnostics } from '../src/lib/builder/diagnostics/report';
import { summariseEconomicHistory } from '../src/lib/erc8183/economic-history';

/*
 * Who may read an agent's diagnostics, tested on the path that decides it
 * rather than on a convenience wrapper.
 *
 * Routes carry `import 'server-only'` through their store imports, so a test
 * cannot call this one: `tests/passkey-signature-verify.test.mts` is the
 * house answer, and it is the one used below — the decision function is
 * exercised directly, and the route's use of it is pinned as source facts,
 * in order, including the things that must *not* appear.
 *
 * The ordering assertions are not decoration. The leak this prevents is a
 * refactor that reads the agent's rows first and filters afterwards, which
 * works, passes review, and hands a rival builder somebody else's
 * conversion problems the first time an error message carries a row with it.
 */

const OWNER = '0xEF869BB780a5163E6D39E83817cD29af6DEaA784';
const SOMEBODY_ELSE = '0x3fb8779f4f42e1800F27AAec9564530BCaa852Bf';

const file = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
/* Comments stripped: these assert what the code does, and several comments
   quote the wrong behaviour on purpose so nobody reinstates it. */
const code = (path: string) => file(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('no proved session reads nothing, and is told why', () => {
  for (const session of [null, undefined, '', 'not-an-address']) {
    const decision = authoriseAgentOwner({ sessionOwner: session, registryOwner: OWNER, chainId: 56, tokenId: '1' });
    assert.equal(decision.ok, false);
    if (decision.ok) throw new Error('unreachable');
    assert.equal(decision.status, 401);
    assert.equal(decision.reason, 'no-session');
  }
});

test('a registry that did not answer is reported as that, never as “not yours”', () => {
  /*
   * The distinction `ownedJob` already makes in the delivery route, for the
   * same reason: telling a builder their own agent is not theirs because an
   * RPC timed out sends them looking for a theft that never happened. And
   * it fails closed — 503 grants nothing.
   */
  for (const registry of [null, undefined, '', '0xnot-an-address']) {
    const decision = authoriseAgentOwner({ sessionOwner: OWNER, registryOwner: registry, registryReachable: false, chainId: 56, tokenId: '1' });
    assert.equal(decision.ok, false);
    if (decision.ok) throw new Error('unreachable');
    assert.equal(decision.status, 503);
    assert.equal(decision.reason, 'registry-unavailable');
    assert.match(decision.message, /could not read the registry/i);
    assert.doesNotMatch(decision.message, /not registered to|not yours/i);
  }
});

test('another builder is refused, and is not told who the owner is', () => {
  const decision = authoriseAgentOwner({
    sessionOwner: SOMEBODY_ELSE,
    registryOwner: OWNER,
    chainId: 56,
    tokenId: '45422',
  });
  assert.equal(decision.ok, false);
  if (decision.ok) throw new Error('unreachable');
  assert.equal(decision.status, 403);
  assert.equal(decision.reason, 'not-owner');
  // The real owner's address is not the refused caller's to learn.
  assert.ok(!decision.message.toLowerCase().includes(OWNER.toLowerCase()));
});

test('the owner is granted, whatever case either address arrived in', () => {
  for (const [session, registry] of [
    [OWNER, OWNER],
    [OWNER.toLowerCase(), OWNER],
    [OWNER, OWNER.toLowerCase()],
    [OWNER.toLowerCase(), OWNER.toLowerCase()],
  ] as const) {
    const decision = authoriseAgentOwner({ sessionOwner: session, registryOwner: registry, chainId: 97, tokenId: '7' });
    assert.equal(decision.ok, true, `${session} / ${registry}`);
    if (!decision.ok) throw new Error('unreachable');
    assert.equal(decision.proof.owner, OWNER, 'checksummed, so downstream comparisons are on one spelling');
    assert.equal(decision.proof.chainId, 97);
    assert.equal(decision.proof.tokenId, '7');
  }
});

test('a refused decision carries no proof, so nothing can be built from it', () => {
  const refused = authoriseAgentOwner({ sessionOwner: SOMEBODY_ELSE, registryOwner: OWNER, chainId: 56, tokenId: '1' });
  assert.equal(refused.ok, false);
  assert.ok(!('proof' in refused), 'a refusal must not carry a capability');
});

test('the report refuses to assemble without a proof the gate minted', () => {
  const input = {
    now: Date.parse('2026-10-22T12:00:00.000Z'),
    attemptsReadable: true,
    attempts: [],
    hireFlowOpens: 0,
    fundedInWindow: 0,
    teamFunded: 0,
    history: summariseEconomicHistory([], Date.parse('2026-10-22T12:00:00.000Z')),
    deliveryFailures: [],
    pokterCheck: null,
    agentWallet: null,
    protocols: [],
  };

  /*
   * A plain object with the right fields is what a call site that forgot
   * the gate would hand over, and it is exactly what must not work. The
   * check is a backstop for the wiring asserted below, not a replacement
   * for it.
   */
  for (const forged of [
    { owner: OWNER, chainId: 56, tokenId: '1' },
    { owner: OWNER, chainId: 56, tokenId: '1', ok: true },
    null,
    undefined,
    'proven',
  ]) {
    assert.equal(isOwnershipProof(forged), false);
    assert.throws(
      // @ts-expect-error — the point is that a caller without a proof is refused at runtime too.
      () => buildBuilderDiagnostics(forged, input),
      /OwnershipNotProvenError|without a proved ownership check/,
    );
  }

  const granted = authoriseAgentOwner({ sessionOwner: OWNER, registryOwner: OWNER, chainId: 56, tokenId: '1' });
  if (!granted.ok) throw new Error('unreachable');
  assert.equal(buildBuilderDiagnostics(granted.proof, input).agent.owner, OWNER);
});

test('the diagnostics route decides ownership before it reads anything', () => {
  const route = code('app/api/builders/diagnostics/route.ts');

  assert.match(route, /consumeRateLimit\(/, 'a public endpoint that fans out needs the brake');
  assert.match(route, /builderSessionOwner\(/, 'the session must come from the signed-challenge cookie');
  assert.match(route, /registryOwnerRead\(/, 'ownership is the registry’s answer now');
  assert.match(route, /authoriseAgentOwner\(/);
  assert.doesNotMatch(route, /listAgents|loadFleet|getAgent\(/, 'the indexer can be minutes behind a transfer; it cannot decide this');

  const decided = route.indexOf('authoriseAgentOwner(');
  const refused = route.indexOf('if (!decision.ok)');
  const collected = route.indexOf('collectBuilderDiagnostics(');
  assert.ok(decided > 0 && refused > decided, 'the refusal has to follow the decision');
  assert.ok(collected > refused, 'nothing is read until the refusal has had its chance to return');
  assert.ok(
    route.indexOf('builderSessionOwner(') < decided && route.indexOf('registryOwnerRead(') < decided,
    'both halves of the decision are read before it is made',
  );
  assert.match(route, /collectBuilderDiagnostics\(decision\.proof\)/, 'and only through the proof the decision returned');
  assert.match(route, /status: decision\.status/, 'the three refusals keep their own statuses');
});

test('the builder page’s panel goes through the same gate as the route', () => {
  /*
   * The page already knows the agent from `loadFleet`, which is the
   * indexer's answer. Using that to release the private panel would mean an
   * agent sold this morning still answers to its previous owner here, on
   * the one surface where the private data is.
   */
  const loader = code('features/studio/diagnostics-data.ts');
  assert.match(loader, /registryOwnerRead\(/);
  assert.doesNotMatch(loader, /getBlockNumber\(/, 'the same single read as the route, for the same reason');
  assert.match(loader, /authoriseAgentOwner\(/);
  assert.match(loader, /collectBuilderDiagnostics\(decision\.proof\)/);
  assert.doesNotMatch(loader, /loadFleet\(/, 'the indexer’s list is not an ownership proof');
  assert.ok(
    loader.indexOf('authoriseAgentOwner(') < loader.indexOf('collectBuilderDiagnostics('),
    'decided before anything is read',
  );
});

test('the recorder keeps the brief and the caller out of the store', () => {
  const store = code('lib/builder/diagnostics/store.ts');
  assert.match(store, /sanitiseFailureReason\(/, 'the seller’s words are the one free-text field and go through the hardened sanitiser');
  assert.match(store, /attemptFingerprint\(\{/);
  assert.match(store, /clientKey: requestClientKey\(input\.request\)/, 'the address is read for the hash and dropped');

  /* The brief and the caller are hash inputs. There is nowhere for either
     to land: the table has no column that could hold them, so a future
     writer cannot persist one by filling in a field that was already there. */
  const sql = code('lib/builder/diagnostics/attempt-sql.ts');
  assert.doesNotMatch(sql, /\b(brief|task|client|ip|address|wallet)\b/i, 'no column may hold the brief or the caller');
  const columns = sql.match(/INSERT INTO hire_attempts\s*\n?\s*\(([^)]*)\)/)?.[1] ?? '';
  assert.ok(columns.includes('fingerprint'), 'the opaque key is the identity');
  assert.doesNotMatch(columns, /brief|client/i);

  /*
   * Both wrappers canonicalise, pinned here because neither can be called
   * from a test: `store.ts` is server-only, so the executable tests reach
   * the SQL layer directly and would still pass with the canonical step
   * removed from the write or the read. That step is the whole fix — a
   * buyer at `?tokenId=045422` recorded attempts under a key the panel
   * never asked for — and it only works if both sides do it.
   */
  assert.match(store, /const tokenId = canonicalTokenId\(input\.tokenId\)/, 'the write canonicalises');
  assert.match(store, /if \(tokenId === null\) return;/, 'and refuses rather than guessing');
  assert.match(store, /const key = canonicalTokenId\(tokenId\)/, 'the read asks under the same key');
  assert.match(store, /if \(key === null\) return \[\];/);
  assert.doesNotMatch(
    store,
    /tokenId: input\.tokenId/,
    'the raw spelling must not reach the row: that was the split',
  );

  /* Both quote paths record, and they record different sources: a trial has
     no wallet behind it and must never read as demand. */
  const quote = code('app/api/hire/quote/route.ts');
  assert.match(quote, /source: 'buyer'/);
  assert.match(code('app/api/trial/route.ts'), /source: 'trial'/);
  assert.doesNotMatch(quote, /source: 'trial'/);
});


test('a registry number that does not exist is a typo, not an outage', () => {
  /*
   * Both were one refusal, and it said the outage's words: a builder who
   * mistyped a registry number was told the lookup had failed and to try
   * again shortly, which is advice to retry forever. Reachability is what
   * separates them, and only a positive answer counts.
   */
  const missing = authoriseAgentOwner({
    sessionOwner: OWNER,
    registryOwner: null,
    registryReachable: true,
    chainId: 56,
    tokenId: '99999999',
  });
  assert.equal(missing.ok, false);
  if (missing.ok) throw new Error('unreachable');
  assert.equal(missing.status, 404);
  assert.equal(missing.reason, 'no-such-agent');
  assert.match(missing.message, /no agent #99999999 on BNB Chain/);
  assert.doesNotMatch(missing.message, /try again shortly/i, 'retrying will never find it');

  /* The chain is named, because the number may be right and the network wrong. */
  const testnet = authoriseAgentOwner({ sessionOwner: OWNER, registryOwner: null, registryReachable: true, chainId: 97, tokenId: '7' });
  if (testnet.ok) throw new Error('unreachable');
  assert.match(testnet.message, /BNB Testnet/);

  /* Unproven reachability keeps the 503 that grants nothing — the default
     where nothing is known must never be the more confident answer. */
  for (const unknown of [undefined, false]) {
    const decision = authoriseAgentOwner({ sessionOwner: OWNER, registryOwner: null, registryReachable: unknown, chainId: 56, tokenId: '1' });
    if (decision.ok) throw new Error('unreachable');
    assert.equal(decision.status, 503, `reachable=${String(unknown)} must not become a 404`);
  }
});

test('a granted proof cannot be re-aimed at another agent', () => {
  /*
   * `readonly` is a compile-time claim and this object is the key rows are
   * read by, so `proof.tokenId = '999'` succeeded at runtime and turned one
   * builder's granted proof into a read of somebody else's agent.
   */
  const granted = authoriseAgentOwner({ sessionOwner: OWNER, registryOwner: OWNER, chainId: 56, tokenId: '45422' });
  if (!granted.ok) throw new Error('unreachable');
  assert.equal(Object.isFrozen(granted.proof), true);

  const target = granted.proof as unknown as Record<string, unknown>;
  assert.throws(() => {
    'use strict';
    target.tokenId = '999';
  }, TypeError);
  assert.equal(granted.proof.tokenId, '45422');
  assert.equal(granted.proof.owner, OWNER);
});

test('the route canonicalises the registry number before it reads anything', () => {
  const route = code('app/api/builders/diagnostics/route.ts');
  /*
   * `/api/hire/quote` accepts any run of digits, so a buyer at
   * `?tokenId=045422` recorded attempts under that literal key while this
   * route asked for `45422`. The 12-digit cap was the other half: a longer
   * id could be recorded and then refused by the reader.
   */
  assert.match(route, /canonicalTokenId\(/);
  assert.doesNotMatch(route, /\\d\{1,12\}/, 'the narrow cap refused ids the writer had accepted');
  const canonical = route.indexOf('canonicalTokenId(');
  assert.ok(canonical > 0 && canonical < route.indexOf('registryOwnerRead('), 'canonical before the ownership read');
  assert.ok(canonical < route.indexOf('collectBuilderDiagnostics('), 'and before anything is read');

  /*
   * Reachability comes from the ownership read itself, not from a second,
   * cheaper question. The method that fails is `eth_call`, and an endpoint
   * whose eth_call is rate limited or pruned still answers
   * `eth_blockNumber` from cache — so a `getBlockNumber` probe reported a
   * reachable chain and a missing agent, and told the owner of a real
   * agent that it did not exist. The unproven case stays the refusal that
   * grants nothing.
   */
  assert.match(route, /registryReachable: read\.answered/);
  assert.doesNotMatch(route, /getBlockNumber\(/, 'a cached cheap call cannot vouch for an eth_call that failed');

  /* Every answer private, refusals included. */
  const privateHeaders = route.match(/headers: (?:PRIVATE|\{ \.\.\.PRIVATE)/g) ?? [];
  assert.ok(privateHeaders.length >= 5, `every response must be no-store, found ${privateHeaders.length}`);
  assert.doesNotMatch(route, /\{ status: 400 \}/, 'the 400 carried no cache header');
});

test('a buyer refused before the agent was called is recorded, not dropped', () => {
  const quote = code('app/api/hire/quote/route.ts');
  /*
   * Eight returns stood in front of the recorder. Three were refusals
   * Pokter issues itself, already classified, and all three were dropped —
   * so the panel printed "every buyer who asked got a signed price" while
   * buyers were being bounced at 400.
   */
  const declared = quote.indexOf('const noted =');
  assert.ok(declared > 0);
  for (const marker of ['briefAcceptable(task, agent)', 'declaredTaskProblems(', 'preflightHireBrief(']) {
    assert.ok(quote.indexOf(marker) > declared, `${marker} must be able to record, so it comes after the recorder`);
  }
  assert.match(quote, /noted\('stopped', \{ code: 'brief-too-short', layer: 'input' \}\)/);
  assert.match(quote, /noted\('stopped', \{ code: 'invalid-task', layer: 'input' \}\)/);
  assert.match(quote, /noted\('stopped', \{ code: preflight\.code, layer: 'input' \}\)/);
});

test('a half-broken node is an outage, not a missing agent', async () => {
  /*
   * Run against a JSON-RPC server rather than asserted about, because the
   * thing being decided is which viem error shape arrives — and only the
   * node can produce it.
   *
   * The case that matters is the realistic partial failure of a public
   * endpoint: `eth_call` rate limited, pruned, or proxied to a backend with
   * no state, while `eth_blockNumber` still answers from cache. A probe
   * that asks the cheap question reads that as a reachable chain holding no
   * such identity, and tells the owner of a real agent it does not exist —
   * which is the 503's whole reason for existing, reached from the other
   * side. `ownerOf` reverting is the only answer that proves the call ran.
   */
  const { createServer } = await import('node:http');
  const state = { call: 'owner' as 'owner' | 'revert' | 'fail' };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += String(c)));
    req.on('end', () => {
      const { id, method } = JSON.parse(body || '{}') as { id?: number; method?: string };
      const send = (payload: Record<string, unknown>) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, ...payload }));
      };
      if (method === 'eth_blockNumber') return send({ result: '0x2f4d1c1' });
      if (method === 'eth_chainId') return send({ result: '0x38' });
      if (method !== 'eth_call') return send({ result: '0x' });
      if (state.call === 'fail') return send({ error: { code: -32000, message: 'missing trie node' } });
      if (state.call === 'revert') return send({ error: { code: 3, message: 'execution reverted', data: '0x7e273289' } });
      return send({ result: `0x000000000000000000000000${OWNER.slice(2).toLowerCase()}` });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  process.env.BSC_MAINNET_RPC_URL = `http://127.0.0.1:${port}`;

  try {
    const { registryOwnerRead } = await import('../src/lib/registry/onchain');
    const status = async () => {
      const read = await registryOwnerRead(56, '45422').catch(() => ({ owner: null, answered: false }));
      const decision = authoriseAgentOwner({
        sessionOwner: OWNER,
        registryOwner: read.owner,
        registryReachable: read.answered,
        chainId: 56,
        tokenId: '45422',
      });
      return decision.ok ? 200 : decision.status;
    };

    state.call = 'owner';
    assert.equal(await status(), 200, 'the owner of a live agent is granted');

    state.call = 'revert';
    assert.equal(await status(), 404, 'an unminted id reverts, which proves the call ran');

    state.call = 'fail';
    assert.equal(
      await status(),
      503,
      'eth_call failing while eth_blockNumber answers is an outage, and must never read as a missing agent',
    );
  } finally {
    server.close();
    delete process.env.BSC_MAINNET_RPC_URL;
  }
});


test('every route that writes a store settles the registry number first', () => {
  /*
   * The canonical key was half done. `/api/hire/quote` and `/api/trial`
   * passed the raw id to the brief-quote and quote-intent stores while the
   * diagnostics panel queried the canonical one, so a caller at
   * `?tokenId=045422` wrote rows that neither the public agent card nor a
   * builder's own panel would ever find. Settling it once per route, right
   * after validation, is what makes every store downstream agree.
   */
  for (const path of ['app/api/hire/quote/route.ts', 'app/api/trial/route.ts']) {
    const src = code(path);
    assert.match(src, /const tokenId = canonicalTokenId\(String\(body\.tokenId \?\? ''\)\)/, path);
    assert.doesNotMatch(src, /const tokenId = String\(body\.tokenId/, `${path} must not keep the raw spelling`);
    const settled = src.indexOf('const tokenId = canonicalTokenId(');
    for (const writer of ['noteBriefQuote(', 'recordHireAttempt({']) {
      const at = src.indexOf(writer);
      if (at >= 0) assert.ok(at > settled, `${path}: ${writer} must see the canonical id`);
    }
  }
  /* And the quote route's own intent write, which keyed the figure that
     has since been cut but still writes a row other code reads. */
  const quote = code('app/api/hire/quote/route.ts');
  assert.ok(quote.indexOf('recordQuoteIntent({') > quote.indexOf('const tokenId = canonicalTokenId('));
});
