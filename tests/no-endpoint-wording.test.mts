import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { blockerCodeForCardProblem } from '../src/lib/agents/card-read';
import { hireBlocker } from '../src/lib/hire/blocker';
import { describeQuoteFailure, quoteFailure } from '../src/lib/hire/failure';
import { NO_ENDPOINT_DETAIL } from '../src/lib/hire/no-endpoint';

/*
 * A `no-endpoint` result says what was read, and nothing more. 56:382582's
 * page said "its agent card offers no HTTPS JSON-RPC interface" when Pokter
 * had read no card: the registry data it reads named no A2A endpoint, and
 * the agent's live registration declared one.
 */

const reason = (detail: string | null, protocols: string[] = ['web']) => hireBlocker({ code: 'no-endpoint', detail, protocols })!.reason;

test('no A2A endpoint in the registry data is said as that, with no claim about a card', () => {
  const words = reason(NO_ENDPOINT_DETAIL.registryNoA2a);
  assert.match(words, /No A2A endpoint found in the registry data Pokter reads/);
  assert.match(words, /No agent card was read/);
  assert.doesNotMatch(words, /card offers|JSON-RPC|publishes no/);
  /* The page's own read takes the same words: no endpoint means nothing was fetched. */
  assert.deepEqual(blockerCodeForCardProblem('no-endpoint'), { code: 'no-endpoint', detail: NO_ENDPOINT_DETAIL.registryNoA2a });
  assert.equal(hireBlocker({ code: 'no-endpoint', detail: NO_ENDPOINT_DETAIL.registryNoA2a })!.transient, false, 'eligibility unchanged');
});

test('each read keeps its own sentence', () => {
  assert.match(reason(NO_ENDPOINT_DETAIL.registryNoWallet), /No agent wallet found in the registry data/);
  assert.match(reason(NO_ENDPOINT_DETAIL.cardWithoutInterface), /Nothing Pokter read at its registered endpoint/);
  assert.match(reason(NO_ENDPOINT_DETAIL.cardWithoutJsonRpc), /Its agent card offers no HTTPS JSON-RPC interface/);
  assert.match(reason(NO_ENDPOINT_DETAIL.registryNoA2a, ['mcp']), /registry data Pokter reads lists only an MCP endpoint/);
  /* Stored before the read was named: what was found, not what the agent lacks. */
  const legacy = reason(null);
  assert.match(legacy, /Pokter found no A2A interface it could call/);
  assert.doesNotMatch(legacy, /card offers|publishes/);
});

test('the buyer is told the same, per read', () => {
  const said = (detail?: string) => describeQuoteFailure(quoteFailure('no-endpoint', detail ? { detail } : {}), 'cfo').message;
  assert.match(said(NO_ENDPOINT_DETAIL.registryNoA2a), /No A2A endpoint found for cfo in the registry data Pokter reads/);
  assert.match(said(NO_ENDPOINT_DETAIL.registryNoWallet), /No agent wallet found for cfo/);
  assert.match(said(NO_ENDPOINT_DETAIL.cardWithoutJsonRpc), /offers no HTTPS JSON-RPC interface/);
  assert.doesNotMatch(said(NO_ENDPOINT_DETAIL.cardWithoutInterface), /without connecting a running agent/, 'not a claim about the operator');
  assert.doesNotMatch(said(), /publishes no/);
  for (const detail of [NO_ENDPOINT_DETAIL.registryNoA2a, NO_ENDPOINT_DETAIL.registryNoWallet, undefined]) assert.equal(describeQuoteFailure(quoteFailure('no-endpoint', detail ? { detail } : {}), 'cfo').status, 409);
});

test('the quote path tells a missing endpoint from a missing wallet, and the API names the registry data as the source', () => {
  const quote = readFileSync(new URL('../src/lib/erc8183/quote.ts', import.meta.url), 'utf8');
  assert.match(quote, /if \(!endpoint\) return fail\(quoteFailure\('no-endpoint', \{ detail: NO_ENDPOINT_DETAIL\.registryNoA2a \}\)\);/);
  assert.match(quote, /if \(!agent\.agent_wallet\) return fail\(quoteFailure\('no-endpoint', \{ detail: NO_ENDPOINT_DETAIL\.registryNoWallet \}\)\);/);
  const route = readFileSync(new URL('../src/app/api/v1/agents/[chainId]/[tokenId]/route.ts', import.meta.url), 'utf8');
  assert.match(route, /registry: 'The registry data Pokter reads for this agent .* No agent card was read/);
  assert.match(route, /provenance: blocker\.from === 'registry' \? 'declared' : 'pokter-measured'/);
  const blocker = readFileSync(new URL('../src/lib/hire/blocker.ts', import.meta.url), 'utf8');
  assert.match(blocker, /card\.problem === 'no-endpoint' \? 'registry' : 'card'/);
});
