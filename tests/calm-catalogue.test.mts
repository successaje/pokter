import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * The catalogue, calmer: two rows of filters instead of three (tasks, then
 * the buyer signals, with the rest behind All filters), cards that say a
 * network once, featured agents that say testnet where it is seen, and
 * three ranking pages that say why they differ.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Discover and the full listing share one filter bar: tasks, then the buyer signals in view, then All filters', () => {
  const bar = code('features/discover/FilterBar.tsx');
  assert.doesNotMatch(bar, /MobileFilterBlock|lg:flex" aria-label="Filters"/, 'no separate phone and desktop bars');
  const signals = bar.slice(bar.indexOf('const SIGNALS'), bar.indexOf('] as const'));
  for (const label of ['Hireable via escrow', 'Has an escrow quote', 'Outside buyer delivered', 'Correctness checked', 'Answered this week']) {
    assert.match(signals, new RegExp(`label: '${label}'`), `${label} is named once`);
  }
  assert.equal(bar.match(/SIGNALS\.map/g)?.length, 2, 'the same signals on the row and in the panel');
  assert.match(bar, /role="switch"\s+aria-checked=\{on\}\s+title=\{hint\}/, 'a signal pill says it is on, and what it means');
  /* Only a filter with no pill on the row becomes a chip, so nothing that is on shows twice. */
  assert.match(bar, /aria-label=\{`Remove filter: \$\{chip\.label\}`\}/);
  const chips = bar.slice(bar.indexOf('export function activeFilterChips'), bar.indexOf('\n}\n', bar.indexOf('export function activeFilterChips')));
  assert.doesNotMatch(chips, /Hireable via escrow|p\.hireable/);
  for (const label of ['Measured by Pokter', 'Has published attestations']) {
    assert.ok(bar.split(label).length >= 3, `${label} is named the same in the panel and on its chip`);
  }
  assert.match(bar, /<FiltersButton>/);
  for (const page of ['app/(site)/discover/page.tsx', 'app/(site)/agents/page.tsx']) {
    const source = code(page);
    assert.match(source, /<FilterBar p=\{base\}/, page);
    assert.doesNotMatch(source, /MobileFilters|MobileFilterBlock/, page);
  }
  const controls = code('features/discover/DiscoverControls.tsx');
  const button = controls.slice(controls.indexOf('export function FiltersButton'), controls.indexOf('export function PillRow'));
  assert.match(button, /All filters/);
  assert.doesNotMatch(button, /rounded-full border/, 'a text button, not one more pill');
  assert.doesNotMatch(button, /lg:hidden/, 'the same control at every width');
  assert.match(button, /variant="drawer"/);
  /* On a phone a row scrolls sideways and opens at the pill that is on, without moving the page. */
  const row = controls.slice(controls.indexOf('export function PillRow'));
  assert.match(row, /max-sm:overflow-x-auto/);
  assert.match(row, /'\[aria-current="true"\], \[aria-checked="true"\]'/);
  assert.doesNotMatch(row, /scrollIntoView\(/);
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
