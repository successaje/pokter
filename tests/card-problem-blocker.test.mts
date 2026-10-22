import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

import { blockerCodeForCardProblem, readCardThrough, type CardProblem } from '../src/lib/agents/card-read';
import { classifyQuoteError } from '../src/lib/hire/failure';
import { hireBlocker } from '../src/lib/hire/blocker';

/*
 * hwayongjin.agent (56:300282): never in the sweep's roster, so its page had
 * no blocker and offered a hire. The page's own card read now supplies one.
 *
 * The read has two steps — the registered endpoint, then the card's own
 * well-known location — and it used to call every 200 at the first step
 * "answers with no agent card". A homepage that answers and a card path that
 * times out or 503s is a failed lookup, and it was reported as the operator
 * having listed an agent without connecting one. These exercise the real
 * two-step read against a server that answers exactly that way.
 */
type Route = (res: ServerResponse) => void;

const json = (body: unknown): Route => (res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const status = (code: number): Route => (res) => {
  res.writeHead(code);
  res.end();
};
/** Accepts the request and never answers it, so the caller's timeout fires. */
const silence: Route = () => {};

async function serve(routes: Record<string, Route>) {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    (routes[path] ?? status(404))(response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async close() {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}

/*
 * The shape of the one fetcher agents are called through in production
 * (`agent-card.ts`): a status, and a body only when the response was ok.
 * Short, because one of these servers never answers.
 */
const fetchJson = async (url: string) => {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(250),
  });
  return { status: response.status, body: response.ok ? await response.json().catch(() => null) : null };
};

/** The real index that failed Pokter's check: a name, a pointer, no skills. */
const INDEX = { name: 'Honeyglass', agentCard: '/.well-known/agent-card.json', rpc: 'POST / (JSON-RPC 2.0)' };
const CARD = { name: 'Honeyglass', skills: [{ id: 'negotiate' }], url: 'https://honeyglass.example/rpc' };

for (const [what, route] of [['503s', status(503)], ['never answers', silence]] as const) {
  test(`a homepage that answers and a card path that ${what} is an unread card, not a missing interface`, async () => {
    const server = await serve({ '/': json(INDEX), '/.well-known/agent-card.json': route });
    try {
      const read = await readCardThrough(`${server.origin}/`, fetchJson);
      assert.equal(read.ok, false);
      assert.equal(read.ok === false && read.problem, 'unreadable');
      /*
       * And the buyer's side of the same read: this used to classify as
       * `no-endpoint`, answered 409 and told them not to try again.
       */
      const failure = classifyQuoteError(new Error(read.ok === false ? read.message : ''));
      assert.notEqual(failure.code, 'no-endpoint');
      assert.equal(failure.retryable, true);
    } finally {
      await server.close();
    }
  });
}

/*
 * The card's location is the agent's own — its host, or the `agentCard`
 * path its index names — and `classifyQuoteError` matches patterns against
 * the whole message. A card host of `signer.example.com` refusing a
 * connection must not arrive as "not signed by its registered wallet":
 * that is permanent, answers 409, and is about a wallet nobody read.
 */
test('a card URL the agent chose cannot decide the buyer’s failure code', async () => {
  const refuse = (): never => {
    throw new TypeError('fetch failed');
  };
  for (const pointer of ['/signatures/card.json', '/recover/card.json', '/signer-card.json']) {
    const server = await serve({ '/': json({ name: 'Honeyglass', agentCard: pointer, rpc: 'POST / (JSON-RPC 2.0)' }) });
    try {
      const read = await readCardThrough(`${server.origin}/`, async (url) =>
        url.endsWith(pointer) ? refuse() : fetchJson(url),
      );
      assert.equal(read.ok === false && read.problem, 'unreadable');
      const message = read.ok === false ? read.message : '';
      assert.ok(!message.includes(pointer), `the message still carries the agent's own path: ${message}`);
      const failure = classifyQuoteError(new Error(message));
      assert.equal(failure.code, 'unreachable', `a refused connection read as ${failure.code}`);
      assert.equal(failure.retryable, true);
    } finally {
      await server.close();
    }
  }
});

test('a card Pokter actually read that names no interface is a missing interface, permanently', async () => {
  const server = await serve({
    '/': json(INDEX),
    '/.well-known/agent-card.json': json({ name: 'hwayongjin.agent', skills: [{ id: 'negotiate' }], url: null }),
  });
  try {
    const read = await readCardThrough(`${server.origin}/`, fetchJson);
    assert.equal(read.ok === false && read.problem, 'no-interface');
    const failure = classifyQuoteError(new Error(read.ok === false ? read.message : ''));
    assert.equal(failure.code, 'no-endpoint');
    assert.equal(failure.detail, 'card-without-interface');
    assert.equal(failure.retryable, false);
  } finally {
    await server.close();
  }
});

test('a card Pokter read while the other location was down still names no interface', async () => {
  // The fact is the card it read, not the lookup that failed after it.
  const server = await serve({
    '/': json({ name: 'hwayongjin.agent', skills: [], supportedInterfaces: [] }),
    '/.well-known/agent-card.json': silence,
  });
  try {
    const read = await readCardThrough(`${server.origin}/`, fetchJson);
    assert.equal(read.ok === false && read.problem, 'no-interface');
  } finally {
    await server.close();
  }
});

test('both locations answered and neither had a card: nowhere to send a brief', async () => {
  const server = await serve({ '/': json({ status: 'UNBOUND', endpoint: null }) });
  try {
    const read = await readCardThrough(`${server.origin}/`, fetchJson);
    assert.equal(read.ok === false && read.problem, 'no-interface');
  } finally {
    await server.close();
  }
});

test('the two-step read still finds a card at the well-known path', async () => {
  const server = await serve({ '/': json(INDEX), '/.well-known/agent-card.json': json(CARD) });
  try {
    const read = await readCardThrough(`${server.origin}/`, fetchJson);
    assert.equal(read.ok, true);
    assert.equal(read.ok && read.card.name, 'Honeyglass');
  } finally {
    await server.close();
  }
});

test('an endpoint that refuses keeps its own status, which is the buyer’s answer', async () => {
  const server = await serve({ '/': status(401) });
  try {
    const read = await readCardThrough(`${server.origin}/`, fetchJson);
    assert.equal(read.ok === false && read.problem, 'unreadable');
    assert.equal(classifyQuoteError(new Error(read.ok === false ? read.message : '')).code, 'auth-required');
  } finally {
    await server.close();
  }
});

test('the first read’s own failure is thrown, not classified', async () => {
  // Nothing answered at all: the caller's error is the most informative thing there is.
  await assert.rejects(readCardThrough('http://127.0.0.1:1/', fetchJson));
});

/*
 * What each read becomes on the page. The permanent problems carry a blocker
 * that withdraws the hire buttons; the unread card must not, because it says
 * nothing about the agent.
 */
const blockerFor = (problem: CardProblem) => {
  const { code, detail } = blockerCodeForCardProblem(problem);
  return hireBlocker({ code, detail, protocols: ['a2a'] });
};

test('only a problem Pokter established blocks a hire; an unread card is transient', () => {
  assert.equal(blockerFor('no-endpoint')?.transient, false);
  assert.equal(blockerFor('card-without-interface')?.transient, false);
  assert.equal(blockerFor('no-price-skill')?.transient, false);
  assert.equal(blockerFor('card-unreadable')?.transient, true);
  // A transient card read must not arrive under the code the panel reads as unreachable.
  assert.notEqual(blockerCodeForCardProblem('card-unreadable').code, 'no-endpoint');
});

test('the builder reads two different claims, not one claim twice', () => {
  const missing = blockerFor('card-without-interface')?.reason ?? '';
  const unread = blockerFor('card-unreadable')?.reason ?? '';
  assert.match(missing, /nowhere to send a brief/);
  assert.match(missing, /Nothing Pokter read/);
  assert.match(unread, /did not answer this read/);
  assert.doesNotMatch(unread, /nowhere to send a brief|no HTTPS JSON-RPC/);
});

test('the missing-interface sentence claims only what was read', () => {
  /*
   * Four reads arrive under this detail, and the sentence has to be true of
   * all four: a card read at the endpoint, a card read at the well-known
   * path, every location answering with no card, and a card read at one
   * place while the other timed out. That last one is why the sentence may
   * not say what a location "returns" — it never answered — and the third
   * is why it may not say a card answered. Neither may it say nothing is
   * running: an agent serving its card off the well-known path is running
   * and reachable there.
   */
  const missing = blockerFor('card-without-interface')?.reason ?? '';
  assert.doesNotMatch(missing, /card answers/i);
  assert.doesNotMatch(missing, /without connecting a running agent/i);
  assert.doesNotMatch(missing, /Neither|nor the/i, 'a negative about a location that may never have answered');
});

test('the other no-endpoint cases keep their own words', () => {
  assert.match(hireBlocker({ code: 'no-endpoint', protocols: ['mcp'] })?.reason ?? '', /only an MCP endpoint/);
  assert.match(hireBlocker({ code: 'no-endpoint', protocols: ['a2a'] })?.reason ?? '', /no HTTPS JSON-RPC interface/);
  assert.match(hireBlocker({ code: 'no-price-skill' })?.reason ?? '', /no negotiate skill/);
});

/*
 * `readCardForPage` and `currentHireBlocker` are `server-only`, so the wiring
 * between the read and the blocker is pinned as a source fact (the house
 * pattern; see `passkey-signature-verify.test.mts`).
 */
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the page read no longer guesses the problem from the thrown sentence', () => {
  const src = withoutComments(source('lib/agents/agent-card.ts'));
  assert.match(src, /read\.problem === 'no-interface'/, 'it reads the discriminated result');
  assert.match(src, /'card-unreadable'/);
  assert.doesNotMatch(
    src,
    /test\(\(error as Error\)|not with an agent card/,
    'matching the message is what made a timed-out lookup a permanent verdict',
  );
});

test('the public agent endpoint reports the card read, and only pays for it when the store is silent', () => {
  /*
   * MCP `get_agent` forwards to this route, and so does the agent-to-agent
   * path, so an agent the sweep never reached said nothing there while its
   * own page said why. The route and the helper are `server-only`, so the
   * call, its gating and its provenance are pinned as source facts.
   */
  const route = withoutComments(source('app/api/v1/agents/[chainId]/[tokenId]/route.ts'));
  assert.match(route, /currentHireBlockerWithCard\(/);
  assert.doesNotMatch(route, /currentHireBlocker\(agent, quote, payable\)/, 'the bare call is the one that reported nothing');
  assert.match(route, /blocker\.from === 'card'/, 'provenance is told, never guessed from the code');

  const live = withoutComments(source('lib/hire/blocker-live.ts'));
  assert.ok(
    live.indexOf('if (onRecord)') < live.indexOf('await readCardForPage('),
    'a public endpoint calls the agent only when nothing on record answers',
  );
  /*
   * `if (onRecord)` is not the whole gate. A quote an escrow can pay makes
   * `currentHireBlocker` answer null — the same answer it gives when the
   * store holds nothing — so the agents that can be hired fell through to
   * the read, and the same quote then made the second decision null too:
   * one outbound request per call, discarded.
   */
  assert.ok(
    live.indexOf('if (quote && payable !== false) return null;') < live.indexOf('await readCardForPage('),
    'a quote an escrow can pay must answer without calling the agent',
  );
  /*
   * The wrapper must not assign provenance. Labelling everything that is
   * not the card read as the sweep was already false once the decision grew
   * a third source: a quote recorded for a buyer's own brief carries a
   * buyer's timestamp, and the route was reporting it as "the latest
   * sweep's read-only price request to the agent".
   */
  assert.doesNotMatch(live, /from: 'sweep'[^;]*\}\s*;?\s*$/m);
  assert.doesNotMatch(live, /\.\.\.onRecord, from:/, 'the branch that produced it names it');
});

test('a route that calls the agent is bounded, and does not promise a cacheable answer', () => {
  /*
   * Two promises this response could not keep once it started reading the
   * card. It had no `maxDuration` while every other outbound-calling route
   * has one, and the card read's own 2.5s budget starts after the DNS
   * lookup inside `assertPublicEndpoint`, so that phase was unbounded. And
   * `apiJson`'s shared 30s/150s cache is justified by data that "moves on a
   * sweep cycle, not per request" — untrue of a fresh `observedAt` and a
   * transient "could not check", which could be re-served for 150s after
   * the agent started answering again.
   */
  const route = withoutComments(source('app/api/v1/agents/[chainId]/[tokenId]/route.ts'));
  assert.match(route, /export const maxDuration = \d+;/);
  assert.match(route, /perRequest: blocker\?\.from === 'card'/);
  assert.match(withoutComments(source('lib/api/respond.ts')), /perRequest \? 'private, no-store'/);
});

test('the live blocker maps a card problem through the one mapping', () => {
  assert.match(withoutComments(source('lib/hire/blocker-live.ts')), /blockerCodeForCardProblem\(card\.problem\)/);
});
