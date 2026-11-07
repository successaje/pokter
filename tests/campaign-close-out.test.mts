import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * After 5 November the banners and the countdowns hid themselves, and the
 * rest kept offering a campaign nobody could enter: a footer link on every
 * page, Studio's "I also want to enter Set and Earn" on every agent check,
 * the guide's steps and its three agents to hire "so they count as three",
 * and adoption bars toward the campaign's targets.
 */
const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('no page links to the campaign from its navigation or the sitemap', () => {
  assert.doesNotMatch(code('shell/SiteFooter.tsx'), /set-and-earn/);
  const sitemap = code('app/sitemap.ts');
  assert.doesNotMatch(sitemap, /'\/set-and-earn'/);
  assert.doesNotMatch(sitemap, /'\/quest'/);
});

test('the guide, once closed, is a record: no steps to take and no agents to hire for it', () => {
  const page = code('app/(site)/set-and-earn/page.tsx');
  assert.match(page, /const live = isCampaignLive\(\);\n\s*if \(!live\) return <ClosedRecord \/>;/);
  const record = page.slice(page.indexOf('function ClosedRecord()'), page.indexOf('function Eligibility()'));
  assert.ok(record.length > 0);
  assert.match(record, /How Set and Earn worked/);
  assert.match(record, /<ClosedNotice \/>/);
  for (const offer of [/Three agents to start with/, /Get testnet funds/, /\/hire\//, /SetAndEarnPanel/, /Register before you do anything else/]) {
    assert.doesNotMatch(record, offer);
  }
  // Its share card and metadata say it closed, too.
  assert.match(page, /title: 'Set and Earn has closed'/);
  assert.match(code('app/(site)/set-and-earn/opengraph-image.tsx'), /if \(!isCampaignLive\(\)\) \{[\s\S]*title="Set and Earn has closed\."/);
});

test('Studio offers the campaign goal only while entries are open', () => {
  assert.match(code('features/studio/CampaignGoal.tsx'), /export function CampaignGoal\([^)]*\) \{\n\s*if \(!isCampaignLive\(\)\) return null;/);
});

test('adoption counts stand alone once the campaign targets no longer apply', () => {
  const page = code('app/(site)/build/(section)/agents/[chainId]/[tokenId]/page.tsx');
  for (const target of ['independentTarget', 'actionsTarget', 'daysTarget']) {
    assert.match(page, new RegExp(`target=\\{campaign \\? ad\\.${target} : null\\}`));
  }
  assert.match(page, /\{target === null \? value : `\$\{value\}\/\$\{target\}`\}/);
  // The one limit of the count is still said: only the owner's own wallets are left out.
  assert.match(page, /Pokter does not trace where a hirer&rsquo;s funds came from/);
});

test('sentences that are not about the campaign no longer mention it', () => {
  for (const file of ['app/(site)/how-it-works/page.tsx', 'shell/wallet/ConnectProvider.tsx']) {
    assert.doesNotMatch(code(file), /Set and Earn/, file);
  }
  // Studio's wallet advice, where a builder hires their own agent: its comment keeps the history.
  assert.doesNotMatch(code('lib/builder/wallet-roles.ts'), /'[^'\n]*Set and Earn[^'\n]*'/);
});
