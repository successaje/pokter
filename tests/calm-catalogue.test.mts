import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * The catalogue, calmer: one Filters control instead of three rows of
 * pills, cards that say a network once, featured agents that say testnet
 * where it is seen, and three ranking pages that say why they differ.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Discover and the full listing share one filter bar: tasks, then one Filters control with removable chips', () => {
  const bar = code('features/discover/FilterBar.tsx');
  assert.doesNotMatch(bar, /MobileFilterBlock|lg:flex" aria-label="Filters"/, 'no separate phone and desktop bars');
  assert.match(bar, /<FiltersButton count=\{chips\.length\}>/);
  assert.match(bar, /aria-label=\{`Remove filter: \$\{chip\.label\}`\}/);
  for (const label of ['Hireable via escrow', 'Has an escrow quote', 'Outside buyer delivered', 'Correctness checked', 'Answered this week', 'Measured by Pokter', 'Has published attestations']) {
    assert.ok(bar.split(label).length >= 3, `${label} is named the same in the panel and on its chip`);
  }
  for (const page of ['app/(site)/discover/page.tsx', 'app/(site)/agents/page.tsx']) {
    const source = code(page);
    assert.match(source, /<FilterBar p=\{base\}/, page);
    assert.doesNotMatch(source, /MobileFilters|MobileFilterBlock/, page);
  }
  const button = code('features/discover/DiscoverControls.tsx');
  assert.match(button, /export function FiltersButton/);
  assert.doesNotMatch(button.slice(button.indexOf('export function FiltersButton')), /lg:hidden/, 'the same control at every width');
  assert.match(button, /variant="drawer"/);
});

test('a card names the registration network only when it differs from where the hire settles', () => {
  const card = code('features/agents/AgentCard.tsx');
  assert.match(card, /\{row\.hireChainId !== row\.chainId && <RegisteredNetwork/);
  assert.match(card, /row\.priceFresh \? 'Escrow quote' : 'Last signed escrow quote'/);
});

test('featured agents say testnet where a reader looks first, and not again under the price', () => {
  const card = code('features/agents/AgentCard.tsx');
  const featured = card.slice(card.indexOf('export function FeaturedAgent'), card.indexOf('\n}\n', card.indexOf('export function FeaturedAgent')));
  assert.match(featured, /<NetworkTag chainId=\{row\.hireChainId\} \/>/);
  assert.match(featured, /<HiringLines row=\{row\} network=\{false\} \/>/);
  assert.match(card, /'Testnet · test tokens'/);
});

test('rankings and proof say what each of the three boards counts, and rankings names its networks', () => {
  const why = code('features/proof/WhyNumbersDiffer.tsx');
  assert.match(why, /one network at a time \(BNB Chain unless you choose testnet\)/);
  assert.match(why, /both networks together, test money included/);
  assert.match(why, /Jobs, not agents/);
  assert.match(code('app/(site)/rankings/page.tsx'), /<WhyNumbersDiffer current="rankings" \/>/);
  assert.match(code('app/(site)/rankings/page.tsx'), /BNB Chain and testnet together · test money included/);
  assert.match(code('app/(site)/proof/page.tsx'), /<WhyNumbersDiffer current="proof" \/>/);
  /* What the leaderboard line claims about networks, from the code it describes. */
  assert.match(code('lib/leaderboard/network.ts'), /return value === 'testnet' \? 'testnet' : 'mainnet';/);
});
