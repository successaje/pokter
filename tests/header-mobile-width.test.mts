import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * The site header with a wallet connected fits a phone. At 375px it ran 13px
 * past the screen's edge: a 24px gap, and the account chip with the full
 * short address. The account menu, anchored to the chip, then started 7px
 * off the left edge once the chip moved left. Measured in a browser at 375
 * and 320px; these pin the pieces that made it fit.
 */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the header row is narrower on phones and unchanged from sm', () => {
  assert.match(source('src/shell/SiteHeader.tsx'), /'frame flex items-center gap-3 [^']*sm:gap-6'/);
});

test('the header account chip narrows its address with the screen, and its name always carries it', () => {
  const button = source('src/shell/wallet/AccountButton.tsx');
  assert.match(button, /aria-label=\{`Wallet \$\{shortAddress\(w\.address\)\}`\}/);
  assert.match(button, /hidden text-\[12\.5px\] min-\[360px\]:inline/, 'nothing below 360px');
  assert.match(button, /<span className="sm:hidden">…\{w\.address\.slice\(-4\)\}<\/span>/, 'the last four below sm');
  assert.match(button, /<span className="hidden sm:inline">\{shortAddress\(w\.address\)\}<\/span>/, 'the full short form from sm');
});

test('the header account menu sits inside the screen on a phone, as the search panel does', () => {
  const button = source('src/shell/wallet/AccountButton.tsx');
  assert.match(button, /className=\{compact \? 'sm:relative' : 'relative'\}/);
  assert.match(button, /compact \? 'inset-x-4 sm:inset-x-auto sm:right-0 sm:w-\[20rem\]'/);
  assert.match(source('src/shell/HeaderSearch.tsx'), /className="sm:relative"/, 'the pattern it follows');
});
