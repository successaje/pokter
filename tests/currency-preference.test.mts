import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getAddress } from 'viem';

import { preferenceReport, preferredCurrency } from '../src/lib/network/currency-preference';
import { enabledHireTokens } from '../src/lib/network/tokens';

/*
 * A buyer's preferred currency, at every entry point: the hire page, a hire
 * link and `get_quote`. It asks; the agent decides; the signed price is never
 * converted or relabelled.
 */

const USDT97 = getAddress('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
const U97 = getAddress('0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565');
const ON = enabledHireTokens(`97:${USDT97}`);

test('the report says whether the agent signed in the currency asked for, and never converts', () => {
  const asked = preferredCurrency(97, USDT97, ON)!;
  assert.deepEqual(preferenceReport(asked, USDT97, 'Pokter Evidence'), { asked: { token: USDT97, symbol: 'USDT' }, honoured: true, note: null });
  const declined = preferenceReport(asked, U97, 'Pokter Evidence')!;
  assert.equal(declined.honoured, false);
  assert.equal(declined.note, 'You asked for USDT; Pokter Evidence signed its price in $U, so it may accept only certain currencies. The hire is funded in $U at exactly that price, or you can choose another agent.');
  assert.equal(preferenceReport(null, U97, 'x'), null, 'no preference, no report');
});

test('only a token Pokter funds on that chain can be asked for', () => {
  assert.equal(preferredCurrency(97, USDT97, enabledHireTokens('')), null, 'turned off: cannot be asked for');
  assert.equal(preferredCurrency(56, USDT97, ON), null, 'a testnet address on mainnet');
  assert.equal(preferredCurrency(97, '0x0000000000000000000000000000000000000001', ON), null);
});

test('every entry point carries the preference the same way', async () => {
  const { currencyFromLink } = await import('../src/features/hire/currency-link');
  assert.equal(currencyFromLink(USDT97), USDT97);
  assert.equal(currencyFromLink('USDT'), null, 'a symbol is not an address');
  assert.equal(currencyFromLink(undefined), null);

  const hook = readFileSync('src/lib/hire/useHire.ts', 'utf8');
  assert.match(hook, /offeredTokens\(escrowChainId\)\.find\(\(t\) => initialCurrency && t\.address\.toLowerCase\(\) === initialCurrency\.toLowerCase\(\)\)\?\.address \?\? null/, 'a link currency is used only when offered there');
  const trial = readFileSync('src/app/api/trial/route.ts', 'utf8');
  assert.match(trial, /preferredCurrency: preferred,/, 'get_quote asks the agent through the same negotiation');
  assert.match(trial, /preference: preferenceReport\(preferred, quote\.currency, agent\.name\)/);
  assert.match(trial, /code: 'preference-not-offered'/);
  const mcp = readFileSync('src/app/api/mcp/route.ts', 'utf8');
  assert.match(mcp, /preferred_currency: \{ type: 'object'/, 'get_quote takes a preference');
  assert.match(mcp, /url\.searchParams\.set\('pay', args\.preferred_token\)/, 'hire_link passes it to the hire page');
  const quote = readFileSync('src/app/api/hire/quote/route.ts', 'utf8');
  assert.match(quote, /preference: preferenceReport\(preferred, quote\.currency, agent\.name\)/, 'the hire page and get_quote report it identically');
});
