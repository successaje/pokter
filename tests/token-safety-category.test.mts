import assert from 'node:assert/strict';
import test from 'node:test';

import { classify, CATEGORIES, CATEGORY_BY_ID } from '../src/lib/agents/categories';
import { interpretBrief } from '../src/lib/brief/interpret';
import { sampleBrief } from '../src/lib/erc8183/sample-enquiry';

const agent = (name: string, description: string) =>
  ({ name, description, tags: [] }) as never;

/*
 * The agent this category exists for. Its description is the live one from
 * honeyglass.onrender.com, which classified as unclassified and so could not
 * be listed however well it worked.
 */
test('a token safety screen is classified, not discarded as noise', () => {
  const honeyglass = agent(
    'Honeyglass',
    'Evidence-first, read-only pre-trade safety screen for BEP-20 tokens on BNB Smart Chain. Returns a PASS / CAUTION / FAIL / UNKNOWN verdict with per-signal evidence and sources. Screens a token contract for honeypot, sellability, buy/sell tax, ownership, mint authority, upgradeable proxy, LP lock and holder base.',
  );
  assert.equal(classify(honeyglass), 'token-safety');
});

test('the category is published with a label and a buyer question', () => {
  const meta = CATEGORY_BY_ID.get('token-safety');
  assert.ok(meta);
  assert.equal(meta.label, 'Token Safety');
  assert.ok(meta.question.length > 10);
  assert.equal(CATEGORIES.length, 8);
});

/*
 * The four that existed must keep their agents. A new category that takes
 * them is worse than no new category, because it moves listings that were
 * already correct.
 */
test('it does not take agents from the four that existed', () => {
  const cases: Array<[string, string]> = [
    ['rebalancing', 'Autonomous PancakeSwap V3 BNB/USDT concentrated-liquidity range rebalancer. Monitors the position and rebalances when price approaches a range boundary.'],
    ['health-factor', 'Reads a full lending position across Venus Core and all 8 isolated pools, computes the true health factor from liquidation thresholds, and returns the repayment that restores a safe position.'],
    ['yield', 'Compares yield routes across BNB Chain vaults, net of gas and impermanent loss, and reports where capital would earn more.'],
    ['grid-trading', 'Grid trading bot that reports whether a buy-low sell-high ladder still fits how the market is moving.'],
  ];
  for (const [expected, description] of cases) {
    assert.equal(classify(agent('Agent', description)), expected, description.slice(0, 40));
  }
});

test('an unrelated agent is still unclassified', () => {
  assert.equal(
    classify(agent('Nothing', 'A general purpose assistant that writes poetry about the weather.')),
    'unclassified',
  );
});

/*
 * The failure this exists to stop: /discover built its counts from its own
 * hardcoded list of four ids cast to Category[], while the cards iterated
 * CATEGORIES. A cast is a promise the compiler stops checking, so adding a
 * fifth category left the page destructuring undefined and it went down in
 * production while every properly typed map updated for free.
 */
test('anything keyed by category must cover every category', () => {
  const counts = Object.fromEntries(
    CATEGORIES.map((category) => [category.id, { shown: 0, indexed: 0 }]),
  );
  for (const category of CATEGORIES) {
    assert.ok(counts[category.id], `no entry for ${category.id}`);
  }
  assert.equal(Object.keys(counts).length, CATEGORIES.length);
});

test('research, trading and content have discoverable agents and usable buyer briefs', () => {
  const cases = [
    ['research', 'Chain Research', 'Produces cited research reports and due diligence for BNB Chain projects.', 'Research BNB Chain agent commerce with cited sources.'],
    ['trading', 'MEFAI Verifiable Autonomous Trader', 'A BNB Chain trading agent with a pre-trade honeypot gate.', 'Review a spot trade with entry and exit conditions.'],
    ['content', 'Copy Studio', 'Writes blog posts, newsletters and social media content for crypto teams.', 'Write a blog post for new BNB Chain builders.'],
  ] as const;
  for (const [category, name, description, brief] of cases) {
    assert.equal(classify(agent(name, description)), category);
    assert.equal(interpretBrief(brief).category, category);
    assert.ok(sampleBrief(category)?.length, category);
    assert.ok(CATEGORY_BY_ID.get(category)?.question, category);
  }
});
