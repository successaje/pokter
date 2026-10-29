import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { awardMessage } from '../src/lib/briefs/model';
import { aboveBudget, fundsAboveBudget, PROPOSAL_QUOTE_MAX_AGE_MS, proposalPriceFrom, proposalPriceProblem, proposalQuoteFresh, type ProposalQuote } from '../src/lib/briefs/proposal-price';

/*
 * A proposal's price is the one its agent signs for the request. If an
 * agent quotes 1 USDT and the budget is 0.5, the proposal is 1 USDT, marked
 * above the budget, and the poster agrees to it when choosing. Nobody on
 * the selling side types an amount the agent has not agreed to.
 */

const USDT56 = '0x55d398326f99059fF775485246999027B3197955';
const U97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const NOW = Date.parse('2026-10-29T12:00:00Z');
const quote: ProposalQuote = {
  briefId: 'r1',
  agentChainId: 56,
  agentTokenId: '7',
  priceRaw: '1000000000000000000',
  priceU: 1,
  currency: USDT56,
  signer: '0x00000000000000000000000000000000000000bb',
  negotiationHash: '0xhash',
  quotedAt: new Date(NOW - 5 * 60_000).toISOString(),
  expiresAt: null,
};
const request = { chainId: 56, paymentToken: USDT56, budgetRaw: '500000000000000000' };
const labels = { price: '0.5 USDT', signed: '1 USDT' };

test('the signed amount becomes the number a proposal signs only when it converts back exactly', () => {
  assert.equal(proposalPriceFrom('1000000000000000000', { decimals: 18 }), 1);
  assert.equal(proposalPriceFrom('100000000000000000', { decimals: 18 }), 0.1);
  assert.equal(proposalPriceFrom('1500000', { decimals: 6 }), 1.5);
  assert.equal(proposalPriceFrom('100000000000000001', { decimals: 18 }), null, 'a rounding of the agent’s price is not the agent’s price');
  assert.equal(proposalPriceFrom('0', { decimals: 18 }), null);
  assert.equal(proposalPriceFrom('abc', { decimals: 18 }), null);
});

test('a quote prices a proposal for half an hour, not as a standing price', () => {
  assert.equal(PROPOSAL_QUOTE_MAX_AGE_MS, 30 * 60_000);
  assert.equal(proposalQuoteFresh(quote, NOW), true);
  assert.equal(proposalQuoteFresh({ quotedAt: new Date(NOW - 31 * 60_000).toISOString() }, NOW), false);
  assert.equal(proposalQuoteFresh({ quotedAt: new Date(NOW + 5 * 60_000).toISOString() }, NOW), false, 'not from the future');
  assert.equal(proposalQuoteFresh({ quotedAt: 'never' }, NOW), false);
});

test('a proposal is accepted only at the price the agent signed for the request', () => {
  const at = new Date(NOW).toISOString();
  assert.equal(proposalPriceProblem({ priceRaw: quote.priceRaw, paymentToken: USDT56.toLowerCase() }, quote, at, labels), null, 'the signed price, whatever the case of the address');
  assert.match(proposalPriceProblem({ priceRaw: '500000000000000000', paymentToken: USDT56 }, quote, at, labels)!, /says 0\.5 USDT, and the agent signed 1 USDT for this request/);
  assert.match(proposalPriceProblem({ priceRaw: quote.priceRaw, paymentToken: USDT56 }, null, at, labels)!, /Ask the agent for its signed price for this request first/);
  assert.match(proposalPriceProblem({ priceRaw: quote.priceRaw, paymentToken: U97 }, quote, at, labels)!, /different token/);
  assert.match(proposalPriceProblem({ priceRaw: quote.priceRaw, paymentToken: USDT56 }, quote, new Date(NOW + 40 * 60_000).toISOString(), labels)!, /more than 30 minutes before/);
});

test('above the budget is marked, in the request’s own token only', () => {
  assert.equal(aboveBudget({ paymentToken: USDT56, priceRaw: quote.priceRaw }, request), true);
  assert.equal(aboveBudget({ paymentToken: USDT56, priceRaw: '500000000000000000' }, request), false, 'at the budget is within it');
  assert.equal(aboveBudget({ paymentToken: USDT56, priceRaw: '1' }, request), false);
  assert.equal(aboveBudget({ paymentToken: U97, priceRaw: quote.priceRaw }, request), false, 'another token is not compared');
  assert.equal(aboveBudget({ paymentToken: null, priceRaw: '2000000000000000000' }, { chainId: 97, paymentToken: null, budgetRaw: '1000000000000000000' }), true, 'an older row with no token is its chain’s $U');
});

test('choosing a proposal above the budget signs the amount; within it, the message is unchanged', () => {
  const above = fundsAboveBudget({ paymentToken: USDT56, priceRaw: quote.priceRaw, priceU: 1 }, request);
  assert.match(above ?? '', /^1 USDT/);
  assert.equal(fundsAboveBudget({ paymentToken: USDT56, priceRaw: '500000000000000000', priceU: 0.5 }, request), null);
  const poster = '0x60eF148485c2a5119fa52ca13c52E9Fd98f28E87';
  assert.equal(awardMessage('r1', 'b1', poster, null), awardMessage('r1', 'b1', poster), 'within budget, older signatures still verify');
  assert.match(awardMessage('r1', 'b1', poster, above), /\nAbove my budget, I will fund: 1 USDT/);
});

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('nobody on the selling side types a price, and the buyer cannot edit one in', () => {
  const form = source('src/features/briefs/ProposalForm.tsx');
  assert.doesNotMatch(form, /setPrice|label="Your price"/, 'no price field');
  assert.match(form, /priceU: quote\.priceU,[\s\S]*?priceRaw: quote\.priceRaw,/, 'the proposal signs the quote exactly');
  assert.match(form, /fetch\(`\/api\/briefs\/\$\{request\.id\}\/quote`, \{\s*method: 'POST'/, 'asked of the agent, on a button');
  assert.match(source('src/features/hire/HireFlow.tsx'), /readOnly=\{proposalHere\}/);
  assert.match(source('src/lib/hire/useHire.ts'), /BigInt\(quote\.intent\.amountRaw\) < BigInt\(proposal\.priceRaw\)[\s\S]{0,80}setBudget\(quote\.priceU\)/, 'a lower fresh price lowers the budget');
});

test('the poster agrees to an above-budget price explicitly, and the route rebuilds the same message', () => {
  const actions = source('src/features/briefs/BriefActions.tsx');
  assert.match(actions, /disabled=\{Boolean\(above\) && !agreed\}/);
  assert.match(actions, /awardMessage\(briefId, bid\.id, poster, above\)/);
  assert.match(source('src/app/api/briefs/[id]/award/route.ts'), /awardMessage\(id, bidId, brief\.poster, fundsAboveBudget\(bid, brief\)\)/);
  const list = source('src/features/briefs/ProposalList.tsx');
  assert.match(list, /Above your budget/);
  assert.match(list, /const underSigned = !signedPrice && /, 'a signed price is not called below the agent’s general one');
});

test('the price is asked of the agent for the request’s own brief and token, and kept for the route', () => {
  const ask = source('src/lib/briefs/proposal-quote.ts');
  assert.match(ask, /const task = hireTaskFromRequest\(brief\)/, 'the brief a hire from the proposal would send');
  assert.match(ask, /preferredCurrency: preferredCurrency\(brief\.chainId, token\.address\)/);
  assert.match(ask, /signed\.currency\.toLowerCase\(\) !== token\.address\.toLowerCase\(\)/, 'another token is refused, never converted');
  assert.match(ask, /getBriefStore\(\)\.recordProposalQuote\(quote\)/);
});
