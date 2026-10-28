import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * The leaderboard opens on every category at once, paginated, with the
 * top three on a podium above the list; the network is a toggle at the top
 * corner; dropdowns close like menus; and a row's links sit on one line.
 */

const page = readFileSync(new URL('../src/app/(site)/leaderboard/page.tsx', import.meta.url), 'utf8');
const dismiss = readFileSync(new URL('../src/features/leaderboard/DismissMenus.tsx', import.meta.url), 'utf8');

test('All is the default and the first choice on every board', () => {
  assert.match(page, /\{ value: ALL_CATEGORIES as Classification \| typeof ALL_CATEGORIES, label: 'All', count: boardAgents\.length \},/);
  assert.doesNotMatch(page, /scoreCategory/, 'the score board no longer picks a category for the reader');
  assert.match(page, /\.filter\(\(row\) => merged \|\| row\.category === browse\.category\)\s*\.map\(\(row, index\) => \(\{ row, rank: index \+ 1 \}\)\);/, 'ranked before the search narrows it');
  assert.match(page, /<ResponsivenessList board=\{responsiveness\.data\} browse=\{browse\} current=\{current\} merged=\{merged\} \/>/);
});

test('the podium is the first three, on page one of an unsearched board, and the list starts after them', () => {
  assert.match(page, /if \(page !== 1 \|\| browse\.search\.trim\(\)\) return \[\];/);
  assert.match(page, /entry\.rank !== null && entry\.rank <= 3/);
  assert.equal(page.match(/<Podium\b/g)?.length, 3, 'on all three boards');
  assert.equal(page.match(/!onPodium\.has\(row\.agent\.key\)/g)?.length, 3, 'nobody appears twice');
  assert.match(page, /const PODIUM_COLUMN: Record<number, string> = \{ 1: 'col-start-2', 2: 'col-start-1', 3: 'col-start-3' \};/, 'drawn second, first, third');
});

test('the network is a toggle at the top corner, not a dropdown', () => {
  assert.match(page, /<NetworkToggle value=\{network\} href=/);
  assert.doesNotMatch(page, /<LinkMenu<BoardNetwork>/);
  assert.match(page, /<nav aria-label="Network"/);
});

test('dropdowns close on a press outside, on Escape, and once an option is chosen', () => {
  assert.match(page, /<details data-menu className="group relative">/);
  assert.match(page, /<DismissMenus \/>/);
  assert.match(dismiss, /document\.addEventListener\('pointerdown', onPointerDown\);/);
  assert.match(dismiss, /if \(event\.key === 'Escape'\) close\(\);/);
  assert.match(dismiss, /closest\('details\[data-menu\] a'\)/);
});

test('an outcomes row carries its receipts by name and its share card as an icon, on one line', () => {
  assert.doesNotMatch(page, /<Icon\.Share size=\{11\} \/> Share card/);
  assert.match(page, /aria-label=\{`Share \$\{row\.agent\.name\}’s card`\}/);
  assert.match(page, /<span className="flex items-center justify-end gap-1">/);
});
