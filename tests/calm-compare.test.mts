import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * Compare keeps the agents in view: their row sticks while the measures
 * scroll under it, on the page and in the sheet.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the agents row sticks, and nothing between it and the scroller breaks sticking', () => {
  const view = code('features/compare/CompareView.tsx');
  const head = view.slice(view.indexOf('<thead>'), view.indexOf('</thead>'));
  assert.equal(head.match(/sticky top-\[var\(--compare-top,0px\)\] z-10/g)?.length, 2, 'the label cell and every agent cell');
  assert.doesNotMatch(head, /Hire/, 'the pinned row is the names only, so it covers as little as it can');
  const body = view.slice(view.indexOf('<tbody'), view.indexOf('</tbody>'));
  assert.match(body, /<HireAction c=\{c\} \/>/, 'Hire is its own row, after the evidence');
  /* A scroller, overflow-x-auto or overflow-hidden, would become what the header sticks to. */
  assert.doesNotMatch(view, /overflow-x-auto|overflow-hidden/);
  assert.match(view, /overflow-clip rounded-\[16px\]/);
  /* Separate borders move with a stuck cell; collapsed ones stay behind. */
  assert.match(view, /border-separate border-spacing-0/);
  /* Chosen by the room it has: the sheet is narrower than the screen. */
  assert.match(view, /<div className="@container">/);
  assert.match(view, /@\[40rem\]:block/);
  assert.match(view, /@\[40rem\]:hidden/);
  assert.doesNotMatch(view, /md:block|md:hidden/);
});

test('the row sits under the site header on the page and flush with the top of the sheet', () => {
  assert.match(code('app/(site)/compare/page.tsx'), /\[--compare-top:57px\]/);
  /* 56px tall once scrolled, plus its rule. */
  assert.match(code('shell/SiteHeader.tsx'), /scrolled \? 'h-14' : 'h-16'/);
  assert.match(code('features/compare/CompareSheet.tsx'), /\[--compare-top:-20px\]/);
  /* Minus the sheet body's own padding. */
  assert.match(code('ui/Sheet.tsx'), /overflow-y-auto overscroll-contain px-5 py-5/);
});

test('the sheet never scrolls out of view: its body frames what is placed inside it, and the dialog does not scroll', () => {
  /*
   * An absolutely placed label inside an unpositioned body took the dialog as
   * its frame, stretched it past the screen, and the panel scrolled away.
   */
  assert.match(code('ui/Sheet.tsx'), /className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5"/);
  const css = code('app/globals.css');
  const sheet = css.slice(css.indexOf('dialog.sheet {'), css.indexOf('}', css.indexOf('dialog.sheet {')));
  assert.match(sheet, /overflow: hidden;/);
  assert.match(sheet, /overscroll-behavior: contain;/);
});
