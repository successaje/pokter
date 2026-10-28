import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { bidMessage } from '../src/lib/briefs/model';
import { GUIDES, guide } from '../src/lib/guides/catalogue';
import { percentOf } from '../src/lib/erc8183/basis-points';
import { buildIntegrationKit } from '../src/lib/integration/kit';

const ESCROW = { chainId: 56, network: 'BNB Chain', commerce: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6', router: '0x51895229E12F9876011789B04f8698af06cCD6DA', policy: '0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5', paymentToken: '0xcE24439F2D9C6a2289F741120FE202248B666666' };
const integrationKit = (origin: string) => buildIntegrationKit(origin, [ESCROW]);

/*
 * The three public starting points: list an agent, hire one, find jobs for
 * one. Each answers the same questions in the same order, and everything
 * the code or the chain decides is read from there rather than typed into
 * the page — so these pin the shape and the sources, not the prose.
 */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = (slug: string) => `src/app/(site)/guides/${slug}/page.tsx`;

test('three guides, one per audience, each with a page at its own href', () => {
  assert.deepEqual(GUIDES.map((g) => g.slug), ['list-your-agent', 'hire-an-agent', 'find-jobs']);
  for (const g of GUIDES) {
    assert.equal(g.href, `/guides/${g.slug}`);
    assert.ok(existsSync(new URL(`../${page(g.slug)}`, import.meta.url)), `${g.slug} has a page`);
    assert.ok(g.summary.length > 40 && g.audience.startsWith('For '), `${g.slug} says who it is for and what it does`);
  }
  assert.ok(existsSync(new URL('../src/app/(site)/guides/page.tsx', import.meta.url)), 'an index lists them');
  assert.throws(() => guide('nope' as never));
});

test('every guide answers the same questions, in the same order', () => {
  for (const g of GUIDES) {
    const text = source(page(g.slug));
    const order = ['Who it’s for', 'You need', 'What it costs', 'Networks and money', "id: 'steps'", "id: 'example'", "id: 'troubleshooting'", "id: 'next'"];
    const at = order.map((needle) => text.indexOf(needle));
    assert.ok(at.every((i) => i >= 0), `${g.slug} has ${order[at.findIndex((i) => i < 0)]}`);
    assert.deepEqual([...at].sort((a, b) => a - b), at, `${g.slug} keeps the order`);
    assert.match(text, /<NetworksAndMoney \/>/, `${g.slug} reads its networks and tokens from the kit`);
    assert.match(text, /<EscrowFee \/>/, `${g.slug} reads the escrow's fee from chain`);
    assert.match(text, /alternates: \{ canonical: entry\.href \}/);
  }
});

test('the listing guide is generated from the integration kit, not retyped', () => {
  const text = source(page('list-your-agent'));
  for (const part of ['kit.checklist.map', 'kit.refusals.map', 'kit.preflight.map', 'example.request', 'example.reply']) assert.ok(text.includes(part), part);
  const kit = integrationKit('https://pokter.xyz');
  assert.ok(kit.checklist.every((step) => step.anchor), 'every step links to its rule');
});

test('the kit’s refusals read as sentences, with the agent never named mid-sentence in capitals', () => {
  for (const r of integrationKit('https://pokter.xyz').refusals) {
    assert.match(r.meaning, /^[A-Z]/, r.code);
    assert.doesNotMatch(r.meaning, /\S The agent/, r.code);
  }
});

test('the proposal example is the text the proposal route verifies, in a verified token', () => {
  const text = source(page('find-jobs'));
  assert.match(text, /const EXAMPLE_MESSAGE = bidMessage\(\{/);
  const message = bidMessage({ briefId: 'b', bidder: '0x0000000000000000000000000000000000000001', placedAt: '2026-10-27T12:00:00.000Z', agentChainId: 56, agentTokenId: '1', priceU: 0.5, paymentToken: '0x55d398326f99059fF775485246999027B3197955', chainId: 56, deliverDays: 2, note: 'n' });
  assert.match(message, /^Price: 0\.5 USDT \(0x55d398326f99059fF775485246999027B3197955\) on chain 56$/m, 'the token by symbol, contract and chain');
});

test('fees, review windows and tokens are read, not written down', () => {
  const shared = source('src/features/guides/Guide.tsx');
  assert.match(shared, /escrowPlatformFee\(chainId\)/);
  assert.match(shared, /disputeWindowSeconds\(chainId\)/);
  assert.match(shared, /integrationKit\(\)\.escrows/);
  assert.match(shared, /<strong>fee unavailable<\/strong>/, 'a failed read says so, per chain');
  assert.doesNotMatch(shared, /\?\? 0|\|\| 0|feeBp: 0/, 'and never falls back to 0%');
  assert.match(shared, /escrowPlatformFee\(chainId\)\.catch\(\(\) => null\)/);
  for (const g of GUIDES) assert.doesNotMatch(source(page(g.slug)), /\b(7 days|15 minutes|0%|10%)\b/, `${g.slug} types no value the chain decides`);
});

test('the footer links every guide, from the same list', () => {
  const footer = source('src/shell/SiteFooter.tsx');
  assert.match(footer, /\.\.\.GUIDES\.map\(\(g\) => \(\{ href: g\.href, label: g\.title \}\)\)/);
  /* The full footer is on the home page only; every other page has the compact one. */
  assert.match(footer, /\{ href: '\/guides', label: 'Guides' \}/);
});

test('the escrow fee, stored in basis points, is said as a percentage without trailing zeros', () => {
  assert.equal(percentOf(0), '0%');
  assert.equal(percentOf(1000), '10%');
  assert.equal(percentOf(50), '0.5%');
  assert.equal(percentOf(125), '1.25%');
});
