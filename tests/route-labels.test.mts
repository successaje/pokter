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
  assert.match(filters, /Hireable via escrow/);
  const flow = source('src/features/hire/HireFlow.tsx');
  assert.match(flow, /`Last signed escrow quote \$\{props\.lastSignedU\}/);
  assert.match(flow, /`Suggested escrow budget \$\{props\.suggestedU\} \$U · no signed quote`/);
  assert.match(source('src/features/agent/HirePanel.tsx'), /'Why it cannot be hired through escrow'/);
});
