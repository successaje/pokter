import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { currencyChoices, currencyEvidence, currencyMismatch } from '../src/lib/hire/currency-choice';
import { materialQuoteChange } from '../src/lib/hire/quote-change';
import { enabledHireTokens, offeredTokens } from '../src/lib/network/tokens';

/*
 * The hire page's currency choice, per agent: the currencies Pokter has
 * seen this agent quote or be funded in, as history and not a promise, with
 * everything else behind "Ask for another currency".
 */

const U56 = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const U97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const USDT56 = '0x55d398326f99059fF775485246999027B3197955';
const USDC56 = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const USD156 = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d';
const ALL_ON = enabledHireTokens(`56:${USDT56},56:${USDC56},56:${USD156}`);
const offered56 = offeredTokens(56, ALL_ON);
const symbols = (list: Array<{ token: { symbol: string } }>) => list.map((c) => c.token.symbol);
const E17 = 10n ** 17n;

test('a single-currency agent: its one known currency is shown, and the rest are asked about, not ruled out', () => {
  const evidence = currencyEvidence({ escrowChainId: 56, quote: { currency: U56, settlementChainId: 56 }, jobs: [] });
  const choices = currencyChoices(56, offered56, evidence);
  assert.equal(choices.lastSigned?.symbol, 'U');
  assert.deepEqual(symbols(choices.seen), ['U']);
  assert.equal(choices.seen[0].seen, 'its last signed quote');
  /* One quote is not "accepts only $U": the others stay askable, with nothing claimed either way. */
  assert.deepEqual(symbols(choices.unknown), ['USDT', 'USDC', 'USD1']);
  assert.ok(choices.unknown.every((c) => c.seen === null));
});

test('a multi-currency agent: the latest quote leads, then the currencies it was funded in, each counted on its own contract', () => {
  const evidence = currencyEvidence({
    escrowChainId: 56,
    quote: { currency: USDT56, settlementChainId: 56 },
    jobs: [
      { chainId: 56, paymentToken: USDC56 },
      { chainId: 56, paymentToken: USDC56.toLowerCase() },
      { chainId: 56, paymentToken: U56 },
      { chainId: 56, paymentToken: USDT56 },
      { chainId: 56, paymentToken: null },
    ],
  });
  assert.deepEqual(evidence.map((e) => [e.token, e.lastQuoted, e.fundedJobs]), [
    [USDT56, true, 1],
    [USDC56, false, 2],
    [U56, false, 1],
  ]);
  const choices = currencyChoices(56, offered56, evidence);
  assert.equal(choices.lastSigned?.symbol, 'USDT');
  assert.deepEqual(symbols(choices.seen), ['USDT', 'USDC', 'U']);
  assert.equal(choices.seen[0].seen, 'its last signed quote; 1 job funded through Pokter');
  assert.equal(choices.seen[1].seen, '2 jobs funded through Pokter');
  assert.deepEqual(symbols(choices.unknown), ['USD1']);
});

test('evidence never crosses chains: testnet quotes and jobs say nothing about mainnet, and the other way round', () => {
  const testnetHistory = { quote: { currency: U97, settlementChainId: 97 }, jobs: [{ chainId: 97, paymentToken: U97 }, { chainId: 97, paymentToken: U97 }] };
  assert.deepEqual(currencyEvidence({ escrowChainId: 56, ...testnetHistory }), []);
  const onMainnet = currencyChoices(56, offered56, []);
  assert.equal(onMainnet.lastSigned, null, 'no signed price here, so no default is claimed');
  assert.deepEqual(onMainnet.seen, []);

  const mainnetHistory = { quote: { currency: USDT56, settlementChainId: 56 }, jobs: [{ chainId: 56, paymentToken: USDC56 }] };
  assert.deepEqual(currencyEvidence({ escrowChainId: 97, ...mainnetHistory }), []);
  /* A quote whose currency's chain cannot be told is no evidence anywhere. */
  assert.deepEqual(currencyEvidence({ escrowChainId: 56, quote: { currency: U56, settlementChainId: null }, jobs: [] }), []);
});

test('a currency Pokter does not offer here is not a choice, even with history', () => {
  const usdtOnly = offeredTokens(56, enabledHireTokens(`56:${USDT56}`));
  const evidence = currencyEvidence({ escrowChainId: 56, quote: { currency: USD156, settlementChainId: 56 }, jobs: [{ chainId: 56, paymentToken: USD156 }] });
  const choices = currencyChoices(56, usdtOnly, evidence);
  assert.equal(choices.lastSigned?.symbol, 'USD1', 'still named as the agent’s last signed currency');
  assert.deepEqual(symbols(choices.seen), []);
  assert.deepEqual(symbols(choices.unknown), ['U', 'USDT']);
});

test('an ignored currency request is named, in the agent’s own money and amount, and nothing is converted', () => {
  assert.deepEqual(currencyMismatch(56, USDC56, { currency: U56, amountRaw: E17.toString() }), { requested: 'Binance-Peg USDC', quoted: '0.1 $U' });
  assert.deepEqual(currencyMismatch(56, U56, { currency: USDT56, amountRaw: (5n * E17).toString() }), { requested: '$U', quoted: '0.5 Binance-Peg USDT' });
  /* Honoured, in any letter case: nothing to decide. */
  assert.equal(currencyMismatch(56, USDC56.toLowerCase(), { currency: USDC56, amountRaw: E17.toString() }), null);
  /* The agent's default sends no request, so whatever it signs is no mismatch. */
  assert.equal(currencyMismatch(56, null, { currency: USDT56, amountRaw: E17.toString() }), null);
  assert.equal(currencyMismatch(56, USDC56, null), null);
});

test('an expired quote: accepting its currency does not carry to a renewal in other money or at another price', () => {
  /* The review quote lapsed and was renewed at funding. The renewal is compared with what was reviewed, as before. */
  const reviewed = { priceRaw: E17.toString(), currency: U56 };
  assert.equal(materialQuoteChange(reviewed as never, { priceRaw: E17.toString(), currency: U56 } as never), null, 'same money and amount: the acceptance still describes it');
  assert.match(materialQuoteChange(reviewed as never, { priceRaw: E17.toString(), currency: USDC56 } as never)!.what, /currency changed/);
  assert.match(materialQuoteChange(reviewed as never, { priceRaw: (2n * E17).toString(), currency: U56 } as never)!.what, /new price/);
});

test('the hire page offers the agent’s choices, keeps its default apart from asking for $U, and gates a mismatch', () => {
  const flow = readFileSync(new URL('../src/features/hire/HireFlow.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/lib/hire/useHire.ts', import.meta.url), 'utf8');
  assert.match(flow, /currencyChoices\(/, 'choices come from the agent’s evidence');
  assert.doesNotMatch(flow, /hire\.currencyOptions\.map\(/, 'not every offered token as if the agent took it');
  assert.match(flow, /Agent’s default/);
  assert.match(flow, /Ask for another currency/);
  assert.match(flow, /Continue with \$\{/);
  /* A requested currency the agent ignored blocks funding until the buyer continues in the quoted one. */
  assert.match(hook, /currencyMismatch\(/);
  assert.match(hook, /'currency-not-confirmed'/);
});

test('the $U swap step is not listed on a hire in another token', () => {
  const flow = readFileSync(new URL('../src/features/hire/HireFlow.tsx', import.meta.url), 'utf8');
  assert.match(flow, /hire\.hireToken \? EXTERNAL_STEPS\.filter\(\(s\) => s\.id !== 'swapping'\) : EXTERNAL_STEPS/);
});
