import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { awardMessage } from '../src/lib/briefs/model';
import { aboveBudget, fundsAboveBudget, PROPOSAL_QUOTE_MAX_AGE_MS, proposalPriceFlexible, proposalPriceFrom, proposalPriceProblem, proposalQuoteFresh, typedPriceProblem, type ProposalQuote } from '../src/lib/briefs/proposal-price';

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

test('a proposal is never below the price the agent signed, and above it only where a hire funds what was proposed', () => {
  const at = new Date(NOW).toISOString();
  assert.equal(proposalPriceProblem({ priceRaw: quote.priceRaw, paymentToken: USDT56.toLowerCase() }, quote, at, labels), null, 'the signed price, whatever the case of the address');
  assert.match(proposalPriceProblem({ priceRaw: '500000000000000000', paymentToken: USDT56 }, quote, at, labels)!, /says 0\.5 USDT, below the 1 USDT the agent signed for this request/);
  assert.match(proposalPriceProblem({ priceRaw: '500000000000000000', paymentToken: USDT56 }, quote, at, labels, { aboveAllowed: true })!, /below/, 'below is refused in any token');
  const higher = { priceRaw: '2000000000000000000', paymentToken: USDT56 };
  assert.match(proposalPriceProblem(higher, quote, at, { price: '2 USDT', signed: '1 USDT' })!, /In this token a hire funds exactly what the agent signs/);
  assert.equal(proposalPriceProblem(higher, quote, at, { price: '2 USDT', signed: '1 USDT' }, { aboveAllowed: true }), null, 'more is allowed where the hire funds a budget');
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

test('only $U lets an owner ask more than the agent signs, since only a $U hire funds a budget', () => {
  assert.equal(proposalPriceFlexible(97, U97), true);
  assert.equal(proposalPriceFlexible(97, null), true, 'an older request with no token is the chain’s $U');
  assert.equal(proposalPriceFlexible(56, USDT56), false);
  const token = { symbol: 'USDT' };
  assert.equal(typedPriceProblem(BigInt(quote.priceRaw), quote, token, '1 USDT', false), null);
  assert.match(typedPriceProblem(BigInt('500000000000000000'), quote, token, '1 USDT', true)!, /No lower than 1 USDT/);
  assert.match(typedPriceProblem(BigInt('2000000000000000000'), quote, token, '1 USDT', false)!, /In USDT a hire funds exactly what your agent signs/);
  assert.equal(typedPriceProblem(BigInt('2000000000000000000'), quote, { symbol: 'U' }, '1 $U', true), null);
  assert.match(typedPriceProblem(null, quote, { symbol: 'U' }, '1 $U', true)!, /Enter a price in \$U/);
});

test('the owner may raise the price in $U, never lower it, and the buyer cannot edit it in', () => {
  const form = source('src/features/briefs/ProposalForm.tsx');
  assert.match(form, /\{flexible \? \(\s*<Field label="Your price"/, 'a price field only where more can be funded');
  assert.match(form, /priceU: Number\(priceText\),[\s\S]*?priceRaw: chosenRaw\.toString\(\),/, 'the proposal signs the price chosen, checked against the quote');
  assert.match(form, /typedPriceProblem\(chosenRaw, quote, token, signedLabel, flexible\)/);
  assert.match(form, /fetch\(`\/api\/briefs\/\$\{request\.id\}\/quote`, \{\s*method: 'POST'/, 'asked of the agent, on a button');
  assert.match(source('src/features/hire/HireFlow.tsx'), /readOnly=\{proposalHere\}/);
  assert.doesNotMatch(source('src/lib/hire/useHire.ts'), /setBudget\(quote\.priceU\)/, 'a hire from a proposal funds the proposal, not a lower fresh price');
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

test('the guide and the provider skill describe the agent’s signed price, not a typed one', () => {
  const guide = source('src/app/(site)/guides/find-jobs/page.tsx');
  assert.doesNotMatch(guide, /at or under (the|its) budget|"price": 0\.12/, 'the old rule is gone');
  assert.match(guide, /choose your agent and ask it for its price/);
  assert.match(guide, /Ask the agent for its signed price for this request first\./, 'the new refusal is explained');
  const skill = source('src/lib/builders/provider-skill.ts');
  assert.doesNotMatch(skill, /A price above a\s+request's budget is refused/);
  assert.match(skill, /\\`prepare_proposal\\` asks the agent what it signs for that\s+request/);
});

/*
 * The floor, the $U premium and the agreed price, said as the code applies
 * them. The guide said a lower fresh quote meant the buyer paid less, and
 * that a link carries no price; the choice and the MCP tool both called a
 * proposal's price the agent's signed one, which in $U it need not be.
 */
test('the guide, the choice and the MCP tool describe a proposal’s price as the code applies it', () => {
  const guide = source('src/app/(site)/guides/find-jobs/page.tsx');
  assert.doesNotMatch(guide, /If it now signs less, the buyer pays less\./, 'a $U hire from a proposal does not follow a lower quote down');
  assert.doesNotMatch(guide, /it carries no price/, 'a link can carry a price now');
  assert.doesNotMatch(guide, /at or under what it signed on the proposal/, 'the cap is the proposal’s price');
  assert.match(guide, /never below the price your agent signs for the request: in \$U it may be more, in any other token it is exactly that price/);
  assert.match(guide, /a \$U hire still funds your proposal&rsquo;s price, the amount the buyer agreed to/);
  assert.match(guide, /choosing it means agreeing to that amount in their signature/);
  assert.match(guide, /the form still holds any price to the one your agent signs/);

  const actions = source('src/features/briefs/BriefActions.tsx');
  assert.doesNotMatch(actions, /the price this agent signed for the request/);
  assert.match(actions, /I&rsquo;ll fund \{above\}, the price on this proposal\./);
  /* The label changed; the words the poster signs did not. */
  assert.equal(awardMessage('b', 'p', '0xAB', '2 $U'), 'Pokter brief award\nBrief: b\nBid: p\nPoster: 0xab\nAbove my budget, I will fund: 2 $U');

  const route = source('src/app/api/mcp/route.ts');
  assert.doesNotMatch(route, /the price is the one the agent signed for it/);
  assert.match(route, /the proposal’s price is at or above what the agent signed for this request in \$U, or exactly that signed price in any other token/);
});
