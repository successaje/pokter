import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { priceSummary } from '../src/features/agent/HirePanel';

/*
 * Prices and availability named by their route. Escrow (ERC-8183) is the
 * only route Pokter takes payment on; pay-per-call (x402) is another, which
 * an agent may declare and Pokter does not support. Only a current signed
 * quote is called an "escrow quote".
 */

const quote = (current: boolean) => ({ label: '0.05 $U', current }) as never;
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the agent page names each amount by what it is, never every amount a quote', () => {
  assert.equal(priceSummary({ quote: quote(true), suggestion: null } as never).caption, 'Escrow quote · signed by the agent');
  assert.match(priceSummary({ quote: quote(false), suggestion: null } as never).caption, /^Last signed escrow quote · expired/);
  /* An expired quote says when, and that a hire is priced by a quote for the buyer's own brief. */
  const expired = priceSummary({ quote: { label: '0.05 $U', current: false, expiresAt: '2026-10-26T20:39:00.000Z' }, suggestion: null } as never);
  assert.equal(expired.caption, 'Last signed escrow quote · expired 26 Oct 2026, 20:39 UTC; a quote for your brief is asked for before payment');
  assert.equal(expired.expired, true);
  assert.equal(priceSummary({ quote: quote(true), suggestion: null } as never).expired, false);
  assert.match(source('src/features/agent/HirePanel.tsx'), /\{price\.expired && <span className="text-\[11\.5px\] text-ink-3">last signed, expired<\/span>\}/, 'the phone bar says an expired price is expired');
  assert.equal(priceSummary({ quote: null, suggestion: { label: '~0.1 $U' } } as never).caption, 'Suggested escrow budget · it has not signed a quote');
  assert.equal(priceSummary({ quote: null, suggestion: null } as never).caption, 'Default escrow budget · it has not signed a quote');
  for (const p of [{ quote: null, suggestion: { label: '~0.1 $U' } }, { quote: null, suggestion: null }]) {
    assert.doesNotMatch(priceSummary(p as never).caption, /Escrow quote/, 'a budget is not a quote');
  }
});

test('cards, filters and the hire page name the route, and an expired price as the last signed one', () => {
  const card = source('src/features/agents/AgentCard.tsx');
  assert.match(card, /row\.priceFresh \? 'Escrow quote' : 'Last signed escrow quote'/);
  assert.match(card, />Hireable via escrow</);
  assert.match(card, /Why it cannot be hired through escrow yet/);
  const filters = source('src/features/discover/FilterBar.tsx');
  assert.doesNotMatch(filters, /Hireable now/);
  for (const path of ['src/app/(site)/page.tsx', 'src/app/(site)/set-and-earn/page.tsx']) assert.doesNotMatch(source(path), /'Hireable now'|>Hireable now</, path);
  assert.match(filters, /Hireable via escrow/);
  const flow = source('src/features/hire/HireFlow.tsx');
  assert.match(flow, /`Last signed escrow quote \$\{props\.lastSignedU\}/);
  assert.match(flow, /`Suggested escrow budget \$\{props\.suggestedU\} \$U · no signed quote`/);
  assert.match(source('src/features/agent/HirePanel.tsx'), /'Why it cannot be hired through escrow'/);
  /* An expired price promises nothing: the agent may refuse or be unavailable when asked again. */
  for (const path of ['src/features/agent/HirePanel.tsx', 'src/features/agents/AgentCard.tsx', 'src/features/hire/HireFlow.tsx', 'src/lib/mcp/agent-card-html.ts']) {
    assert.doesNotMatch(source(path), /is signed when you hire/, path);
  }
  assert.match(source('src/lib/mcp/agent-card-html.ts'), /'Last signed escrow quote; a fresh quote is requested before payment'/);
  /* The agent page's pricing table, the readiness row, the home card and a request's proposals name the route too. */
  assert.match(source('src/app/(site)/agents/[chainId]/[tokenId]/page.tsx'), /label: p\.quote\.current \? 'Escrow quote' : 'Last signed escrow quote'/);
  assert.match(source('src/features/home/data.ts'), /!row\.priceFresh \? 'Last signed escrow quote' : 'Escrow quote'/);
  assert.match(source('src/features/briefs/ProposalList.tsx'), /Last signed escrow quote <span/);
  assert.doesNotMatch(source('src/lib/agents/readiness.ts'), /label: 'Signed price'/);
});
