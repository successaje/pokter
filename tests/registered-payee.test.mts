import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { chooseRegisteredWallet } from '../src/lib/registry/registered-wallet';

/*
 * One payee, from one source, on every route that can fund a job.
 *
 * Every hire route read the indexer's copy of an agent's wallet, so a
 * wallet changed or cleared on chain since the copy was made was still the
 * one a quote was checked against and a job paid. The registry's own
 * `getAgentWallet` now decides, and the quote, the page and the job read it
 * the same way. The NFT owner is never a payee, and neither is a wallet an
 * agent names about itself.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const A = '0x75A0000000000000000000000000000000006B19';
const B = '0x348C000000000000000000000000000000001234';

test('the registry decides the payee; the copy stands in only when the chain does not answer', () => {
  assert.equal(chooseRegisteredWallet({ answered: true, wallet: A }, B), A, 'the registry over a stale copy');
  assert.equal(chooseRegisteredWallet({ answered: true, wallet: null }, B), null, 'a cleared wallet is none, whatever the copy says');
  assert.equal(chooseRegisteredWallet({ answered: false, wallet: null }, B), B, 'an unanswered chain falls back to the copy');
  assert.equal(chooseRegisteredWallet({ answered: false, wallet: null }, null), null);
});

test('every route that prices or funds a hire reads the payee the same way', () => {
  assert.match(code('app/api/hire/quote/route.ts'), /const agent = await withRegisteredWallet\(indexed\);/);
  assert.match(code('app/api/hire/prepare/route.ts'), /const agent = await withRegisteredWallet\(indexed\);/);
  const profile = code('features/agent/profile.ts');
  assert.match(profile, /const payee = await registeredAgentWallet\(agent\);/);
  assert.match(profile, /providerChoicesFor\(\{ \.\.\.agent, agent_wallet: payee \}/, 'the page offers the wallet the quote is checked against');
  assert.match(profile, /agentWallet: payee,/);
  assert.match(code('lib/erc8183/quote.ts'), /const agentWallet = await registeredAgentWallet\(agent\);/);
  assert.match(code('lib/history/sweep.ts'), /const priced = await withRegisteredWallet\(agent\);/, 'a stored price is one a hire would accept');
  assert.match(code('lib/erc8183/seller-notice.ts'), /const registered = await registeredAgentWallet\(agent\);/, 'and the seller is told about a job paying the wallet the hire paid');
});

test('the job pays the wallet the quote was verified against, and the page refuses to fund if it changed', () => {
  const route = code('app/api/hire/quote/route.ts');
  assert.doesNotMatch(route, /agent\.agent_wallet \?\? quote\.signer/);
  assert.equal((route.match(/provider: quote\.signer,/g) ?? []).length, 2);
  assert.match(code('lib/erc8183/negotiation.ts'), /if \(vouched\) signer = expected;/, 'a contract wallet answers only for the wallet expected');
  const hire = code('lib/hire/useHire.ts');
  assert.match(hire, /if \(signedQuote\.signer && signedQuote\.signer\.toLowerCase\(\) !== providerAddress\.toLowerCase\(\)\) \{\s*throw new HireFailure\(/);
  assert.match(hire, /'provider-changed', false\);/);
});

test('the NFT owner is never paid in place of the agent wallet', () => {
  const assay = code('app/api/assay/paid/route.ts');
  assert.doesNotMatch(assay, /agent_wallet \?\? agent\.owner_address/);
  assert.match(assay, /const provider = \(await registeredAgentWallet\(agent\)\) as `0x\$\{string\}` \| null;/);
  assert.doesNotMatch(code('lib/registry/live-agent.ts'), /ownerOf|owner_address/);
});
