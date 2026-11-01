import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CATEGORIES, classify, scoreCategories, type Classification } from '../src/lib/agents/categories';
import { main } from '../scripts/category-dry-run.mjs';
import { DISCOVERY_QUERIES, KEYWORD_TERMS } from '../scripts/category-snapshot.mjs';
import {
  NOT_LISTED,
  PRODUCTION,
  RECOMMENDED,
  SIGNALS,
  VARIANTS,
  asClassified,
  deadTerms,
  diffClassifications,
  evidenceFor,
  inCatalogue,
  mirrorAgrees,
  renderMarkdown,
  runDryRun,
  scoreReviewSet,
  type DryRunAgent,
  type ReviewEntry,
  type RuleSet,
} from '../scripts/category-variants.mjs';

/*
 * The category dry run: what a change to the category rules would do,
 * measured before anyone proposes it.
 *
 * Two kinds of assertion live here. Those about production pin what the
 * classifier does today, so a later rule change has to edit this file on
 * purpose and say what it moved. Those about the dry run check the diff and
 * the catalogue model it reports through, on the review set and on agents
 * built to isolate one rule each.
 */

const review = JSON.parse(readFileSync(new URL('./fixtures/categories/review-set.json', import.meta.url), 'utf8')) as { agents: ReviewEntry[] };
const entries = review.agents;
const variant = (id: string): RuleSet => {
  const found = VARIANTS.find((v) => v.id === id);
  assert.ok(found, `no variant ${id}`);
  return found;
};
const CLASSIFICATIONS: Classification[] = [...CATEGORIES.map((c) => c.id), 'unclassified'];

test('the review set says what it believes, and that nobody has confirmed it', () => {
  assert.ok(entries.filter((e) => e.kind === 'misfile').length >= 5);
  assert.ok(entries.filter((e) => e.kind === 'guard').length >= 10);
  for (const entry of entries) {
    assert.ok(CLASSIFICATIONS.includes(entry.expected), `${entry.name}: expected ${entry.expected}`);
    assert.equal(typeof entry.reviewed, 'boolean', `${entry.name}: reviewed`);
    assert.ok(entry.why.length > 20, `${entry.name}: why`);
    /* A misfile is one whose current category we believe is wrong; a guard, one we believe is right. */
    assert.equal(entry.current === entry.expected, entry.kind === 'guard', `${entry.name}: ${entry.kind}`);
  }
  assert.equal(new Set(entries.map((e) => `${e.chainId}:${e.tokenId}`)).size, entries.length);
});

test('production files every review-set agent where it does today', () => {
  /*
   * The pin. Changing the production rules will fail this for every agent
   * the change moves, which is the point: the edit to `current` is where a
   * reviewer sees what moved.
   */
  for (const entry of entries) {
    const record = asClassified(entry, entry.view ?? 'record');
    assert.equal(classify(record), entry.current, `${entry.name} (${entry.chainId}:${entry.tokenId})`);
    assert.equal(entry.liveCategory, entry.current, `${entry.name}: the live site showed ${entry.liveCategory}`);
  }
});

test('the known misfiles are misfiled on one piece of evidence each', () => {
  /* What the variants are trying to fix, stated against production's own working. */
  const evidence = (tokenId: string) => {
    const entry = entries.find((e) => e.tokenId === tokenId)!;
    return scoreCategories(asClassified(entry, entry.view ?? 'record'))[0];
  };
  assert.deepEqual([evidence('114265').category, evidence('114265').matched], ['rebalancing', ['rebalanc']]);
  assert.deepEqual([evidence('114276').category, evidence('114276').matched], ['rebalancing', ['rebalanc']]);
  assert.deepEqual([evidence('310229').category, evidence('310229').matched], ['grid-trading', ['ladder']]);
  assert.deepEqual([evidence('11224').category, evidence('11224').matched], ['token-safety', ['honeypot']]);
  assert.deepEqual([evidence('154180').category, evidence('154180').matched], ['yield', ['vault']]);
});

test('the mirror scorer agrees with production on every review-set agent, with tags and without', () => {
  for (const entry of entries) {
    assert.ok(mirrorAgrees(asClassified(entry, 'record')), `${entry.name} with tags`);
    assert.ok(mirrorAgrees(asClassified(entry, 'list-row')), `${entry.name} without tags`);
  }
  /* And a rule set that is production with nothing added changes nothing. */
  const mirror: RuleSet = { ...PRODUCTION, id: 'mirror', production: undefined };
  assert.equal(diffClassifications(entries, PRODUCTION, mirror).changes.length, 0);
});

test("the mirrored term lists are production's, term for term", () => {
  const source = readFileSync(new URL('../src/lib/agents/categories.ts', import.meta.url), 'utf8');
  const start = source.indexOf('const SIGNALS');
  const block = source.slice(start, source.indexOf('\n};', start));
  const quoted = (list: string) => [...list.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  const parsed: Record<string, { strong: string[]; weak: string[] }> = {};
  for (const m of block.matchAll(/(?:'([a-z-]+)'|([a-z-]+)):\s*\{\s*strong:\s*\[([\s\S]*?)\],\s*weak:\s*\[([\s\S]*?)\],?\s*\}/g)) {
    parsed[m[1] ?? m[2]] = { strong: quoted(m[3]), weak: quoted(m[4]) };
  }
  assert.deepEqual(parsed, SIGNALS);
});

test("the snapshot's discovery reads are the ones the category listings make", () => {
  const source = readFileSync(new URL('../src/lib/marketplace.ts', import.meta.url), 'utf8');
  for (const { id } of CATEGORIES) {
    for (const term of [...DISCOVERY_QUERIES[id], ...KEYWORD_TERMS[id]]) {
      assert.ok(source.includes(`'${term}'`), `${id}: "${term}" is not in src/lib/marketplace.ts`);
    }
  }
});

test('a diff lists only the agents that change, with the terms and fields behind both decisions', () => {
  const { before, after, changes } = diffClassifications(entries, PRODUCTION, variant('c-lone-name-word-must-name-category'));

  assert.deepEqual(
    changes.map((c) => [c.name, c.from, c.to]),
    [
      ['Beta Ladder', 'grid-trading', 'unclassified'],
      ['BORT Vault Guardian #10468', 'yield', 'unclassified'],
    ],
  );
  const ladder = changes[0];
  assert.equal(ladder.key, '56:310229');
  assert.equal(ladder.fromConfidence, 0.5);
  assert.deepEqual(ladder.fromTerms, [{ term: 'ladder', strength: 'weak', fields: ['name', 'description'], independent: true }]);
  /* An agent that loses its category shows what it turned down, and on what. */
  assert.equal(ladder.declined, 'grid-trading');
  assert.deepEqual(ladder.toTerms.map((t) => t.term), ['ladder']);

  /* The counts cover every agent, not just the ones that change. */
  const total = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total(before), entries.length);
  assert.equal(total(after), entries.length);
  assert.equal(after['grid-trading'], before['grid-trading'] - 1);
  assert.equal(after.yield, before.yield - 1);
  assert.equal(after.unclassified, before.unclassified + 2);
});

test('a term inside a strong term is one piece of evidence, not two', () => {
  const [best] = evidenceFor({ name: 'Agent', description: 'A grid trading assistant.', tags: [] } as never);
  assert.equal(best.category, 'grid-trading');
  assert.deepEqual(
    best.hits.map((h) => [h.term, h.independent]),
    [
      ['grid trad', true],
      ['grid', false],
    ],
  );
});

test('each variant, scored on the review set', () => {
  /*
   * Pinned so that changing a variant shows what it does to the agents we
   * have looked at. None of this is production behaviour.
   */
  const scores = Object.fromEntries(
    VARIANTS.map((v) => {
      const s = scoreReviewSet(entries, v);
      return [v.id, { fixed: s.fixed.length, unfixed: s.unfixed.length, kept: s.kept.length, broken: s.broken.length }];
    }),
  );
  assert.deepEqual(scores, {
    'a-no-lone-weak-name': { fixed: 2, unfixed: 3, kept: 9, broken: 3 },
    'b-two-prose-terms': { fixed: 5, unfixed: 0, kept: 4, broken: 8 },
    'c-lone-name-word-must-name-category': { fixed: 2, unfixed: 3, kept: 12, broken: 0 },
    'd-c-plus-anchored-everyday-terms': { fixed: 4, unfixed: 1, kept: 12, broken: 0 },
    'e-d-plus-single-check': { fixed: 5, unfixed: 0, kept: 12, broken: 0 },
  });
  /* What A and B cost: agents that name their category with its own word, and agents filed on one strong term. */
  assert.deepEqual(scoreReviewSet(entries, variant('a-no-lone-weak-name')).broken, [
    'Gridwright (97:1841)',
    'Brain on BNB — BSC Grid Planner (56:302258)',
    'Fee Yield Scout (97:2048)',
  ]);
  assert.ok(scoreReviewSet(entries, variant('b-two-prose-terms')).broken.includes('ChainPilot (97:2677)'));
});

const agent = (over: Partial<DryRunAgent> & { name: string; description: string }): DryRunAgent => ({
  chainId: 56,
  tokenId: over.name,
  tags: [],
  listed: true,
  signedPrice: false,
  surfacedBy: [],
  ...over,
});

test('the catalogue model places an agent the way the catalogue is built', () => {
  const twoTerms = variant('b-two-prose-terms');

  /* Found by its listing, and its list row classifies there. */
  const listed = agent({ name: 'Range Keeper', description: 'Rebalances a liquidity position.', liveCategory: 'rebalancing', surfacedBy: ['rebalancing'] });
  assert.deepEqual([inCatalogue(listed, PRODUCTION).shownAs, inCatalogue(listed, PRODUCTION).via], ['rebalancing', 'listing']);

  /* Losing the category: a signed price keeps it in the catalogue as Unclassified; without one it leaves. */
  const thin = { name: 'Agent 7', description: 'Automated rebalancing.', liveCategory: 'rebalancing' as const, surfacedBy: ['rebalancing' as const] };
  assert.equal(inCatalogue(agent({ ...thin, signedPrice: true }), twoTerms).shownAs, 'unclassified');
  assert.equal(inCatalogue(agent({ ...thin, signedPrice: false }), twoTerms).shownAs, NOT_LISTED);

  /* A declared tag only counts where the record is read: a signed agent is added on its record, tags included. */
  const tagged = agent({ ...thin, tags: ['rebalancing'], signedPrice: true });
  assert.deepEqual([inCatalogue(tagged, twoTerms).shownAs, inCatalogue(tagged, twoTerms).via], ['rebalancing', 'record']);

  /* Moving to a category whose listing did not find it is leaving, unless something else adds it. */
  const mover = agent({ name: 'Plinth', description: 'Keeps savings vaults and lending markets rebalanced.', liveCategory: 'rebalancing', surfacedBy: ['rebalancing'] });
  const anchored = variant('d-c-plus-anchored-everyday-terms');
  assert.equal(inCatalogue(mover, anchored).decision.category, 'yield');
  assert.equal(inCatalogue(mover, anchored).shownAs, NOT_LISTED);
  assert.equal(inCatalogue({ ...mover, surfacedBy: ['rebalancing', 'yield'] }, anchored).shownAs, 'yield');
});

test('each condition of the recommended variant, on an agent built to meet it', () => {
  const rules = variant(RECOMMENDED);
  const decide = (name: string, description: string) => diffClassifications([agent({ name, description })], PRODUCTION, rules).after;
  const only = (counts: Record<string, number>) => Object.entries(counts).find(([, n]) => n > 0)?.[0];

  /* A name word that is not the category's own does not classify alone; the category's own word does. */
  assert.equal(only(decide('Beta Ladder', 'Production-cost analyst.')), 'unclassified');
  assert.equal(only(decide('Gridwright', 'Plans for BSC pairs.')), 'grid-trading');
  /* "Rebalancing" alone counts when it is said of something that can be rebalanced. */
  assert.equal(only(decide('Seer', 'Practises polarity diagnosis and rebalancing.')), 'unclassified');
  assert.equal(only(decide('Keeper', 'Bounded rebalancing for liquidity positions.')), 'rebalancing');
  /* One named check is a feature; the service's own name, or a second check, is the category. */
  assert.equal(only(decide('Sniper', 'Buys new launches after a honeypot check.')), 'unclassified');
  assert.equal(only(decide('Checker', 'Honeypot test and sell tax for any token.')), 'token-safety');
  assert.equal(only(decide('Desk', 'Token safety checks on request.')), 'token-safety');
  /* A term with only a category meaning still stands alone. */
  assert.equal(only(decide('Sentinel', 'Health factor protection plans.')), 'health-factor');
});

test('the dry run over the review set reproduces today and reports every change', () => {
  const report = runDryRun({ agents: entries }, { path: 'review-set.json', review: entries, now: new Date('2026-11-01T00:00:00Z') });

  assert.equal(report.checks.liveReproduced.matched, entries.length);
  assert.equal(report.checks.mirrorParity.matched, report.checks.mirrorParity.of);
  assert.equal(report.recommendation.variant, RECOMMENDED);

  const recommended = report.variants.find((v) => v.id === RECOMMENDED)!;
  /* On the review set the recommended rules move the misfiles and nothing else. */
  assert.deepEqual(
    recommended.changes.map((c) => c.key).sort(),
    entries.filter((e) => e.kind === 'misfile').map((e) => `${e.chainId}:${e.tokenId}`).sort(),
  );
  assert.equal(recommended.summary.lostCategory, 5);
  /* None of the five has signed a price, so all five leave the catalogue rather than staying as Unclassified. */
  assert.equal(recommended.summary.lostCategoryLeaves, 5);

  const markdown = renderMarkdown(report);
  for (const change of recommended.changes) assert.ok(markdown.includes(change.key), `${change.name} is missing from the report`);
  assert.match(markdown, /\| rebalancing \| — \| 5 \| /);
});

test('production matches terms inside other words, and never matches a hyphenated term', () => {
  /* Findings the report carries; pinned so a fix to either is a deliberate change here. */
  const inside = evidenceFor({ name: 'OmegaPrime', description: 'Risk management.', tags: [] } as never, 'substring');
  assert.deepEqual(inside.find((e) => e.category === 'yield')?.matched, ['apr']);
  assert.equal(evidenceFor({ name: 'OmegaPrime', description: 'Risk management.', tags: [] } as never, 'word-start').length, 0);

  assert.deepEqual(deadTerms().map((d) => d.term), ['auto-compound', 'pre-trade safety', 'bep-20', 'erc-20']);
  const [best] = scoreCategories({ name: 'Vault', description: 'auto-compound', tags: [] } as never);
  assert.equal(best.matched.includes('auto-compound'), false);
});

test('the command writes a Markdown and a JSON report from a snapshot file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pokter-category-dry-run-'));
  try {
    const input = join(dir, 'snapshot.json');
    writeFileSync(input, JSON.stringify({ takenAt: '2026-11-01T00:00:00Z', agents: entries }));
    const out = join(dir, 'out');
    const run = main(['--input', input, '--out', out]);
    assert.equal(run.code, 0, run.lines.join('\n'));
    const json = JSON.parse(readFileSync(join(out, 'category-dry-run.json'), 'utf8')) as { schema: string; variants: unknown[] };
    assert.equal(json.schema, 'pokter.category-dry-run/v1');
    assert.equal(json.variants.length, VARIANTS.length);
    assert.match(readFileSync(join(out, 'category-dry-run.md'), 'utf8'), /^# Category dry run/);

    assert.equal(main([]).code, 2, 'no input is a usage error, not an empty report');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
