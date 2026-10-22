import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { unknownParams } from '../src/lib/api/params';

const PARAMS = ['q', 'category', 'limit', 'offset'] as const;
const ask = (query: string) => unknownParams(new URLSearchParams(query).keys(), PARAMS);

test('the parameters the endpoint has are accepted', () => {
  assert.equal(ask('q=is:mainnet&category=yield&limit=50&offset=25'), null);
  assert.equal(ask(''), null);
});

test('a parameter the endpoint does not have is refused, not ignored', () => {
  /*
   * The case this exists for. `?chainId=56` answered 200 with both chains:
   * a list that reads as filtered and is not one. Three agents were read as
   * chain 56 when they were chain 97, and the conclusions drawn from that
   * were wrong — including a reported production gap that did not exist.
   */
  const refused = ask('chainId=56&limit=200');
  assert.ok(refused);
  assert.deepEqual(refused.names, ['chainId']);
  assert.match(refused.message, /Unknown parameter: `chainId`/);
  // And what to use instead, so the caller is not left reading source.
  assert.match(refused.message, /q=is:mainnet or q=is:testnet/);
  // And what this endpoint does take.
  for (const name of PARAMS) assert.match(refused.message, new RegExp(`\`${name}\``));
});

test('the name is echoed exactly as it was spelled', () => {
  /*
   * The hint is matched case-insensitively because a caller may guess any
   * casing, but the name reported back is the string they have to find and
   * change in their own code.
   */
  for (const spelling of ['chainId', 'chain_id', 'CHAINID', 'ChainID']) {
    const refused = ask(`${spelling}=56`);
    assert.ok(refused, spelling);
    assert.deepEqual(refused.names, [spelling]);
    assert.match(refused.message, /q=is:mainnet/, spelling);
  }
});

test('several unknown parameters are all named, once each', () => {
  const refused = ask('chainId=56&nonsense=1&chainId=97&page=2');
  assert.ok(refused);
  assert.deepEqual(refused.names, ['chainId', 'nonsense', 'page']);
  assert.match(refused.message, /Unknown parameters:/);
  assert.match(refused.message, /paging is offset and limit/);
  // One hint, not one per spelling of the same mistake.
  assert.equal(refused.message.match(/q=is:mainnet/g)?.length, 1);
});

test('a guess with no hint is still refused, and still says what is accepted', () => {
  const refused = ask('wobble=1');
  assert.ok(refused);
  assert.deepEqual(refused.names, ['wobble']);
  assert.match(refused.message, /This endpoint takes/);
});

test('the route refuses before it reads anything, and says where chain lives', () => {
  /*
   * Asserted as a source fact: the handler imports `server-only` through
   * its marketplace reads, so a test cannot call it. What matters is that
   * the check runs before the parameters are read, and that the route's own
   * documentation points at the query term rather than leaving the next
   * caller to guess `chainId` again.
   */
  const route = readFileSync(new URL('../src/app/api/v1/agents/route.ts', import.meta.url), 'utf8');
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '');
  const check = code.indexOf('unknownParams(url.searchParams.keys()');
  const read = code.indexOf("url.searchParams.get('q')");
  assert.ok(check > 0 && read > check, 'refused before the query is read');
  assert.match(code, /const PARAMS = \['q', 'category', 'limit', 'offset'\]/);
  assert.match(route, /chain is `q=is:mainnet` or `q=is:testnet`, not a `chainId` parameter/);
});

test('the chain filter the hint names is a real query term', () => {
  /*
   * A hint that points somewhere that does not exist is worse than none.
   * `is:` terms are validated against this list, so the two the message
   * recommends have to be in it.
   */
  const query = readFileSync(new URL('../src/lib/search/query.ts', import.meta.url), 'utf8');
  const flags = query.match(/const IS_FLAGS = \[([^\]]+)\]/)?.[1] ?? '';
  for (const flag of ['mainnet', 'testnet', 'hireable', 'live']) {
    assert.match(flags, new RegExp(`'${flag}'`), `is:${flag} is a real term`);
  }
});
