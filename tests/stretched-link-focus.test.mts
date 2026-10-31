import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * A card or row that links as a whole does it through an overlay on the
 * name's link. Keyboard focus has to show on that overlay, round the whole
 * area, or tabbing through a list moves with nothing on screen.
 */

const src = new URL('../src/', import.meta.url);
const code = (path: string) => readFileSync(new URL(path, src), 'utf8');

function sources(dir = ''): string[] {
  return readdirSync(new URL(dir, src), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sources(`${dir}${entry.name}/`) : entry.name.endsWith('.tsx') ? [`${dir}${entry.name}`] : [],
  );
}

test('the focus ring of a link that covers its card goes round the card', () => {
  const css = code('app/globals.css');
  const rule = css.slice(css.indexOf('a[class*="after:absolute"]:focus-visible::after {'));
  assert.ok(css.includes('a[class*="after:absolute"]:focus-visible::after {'), 'the overlay carries the ring');
  assert.match(rule.slice(0, rule.indexOf('}')), /outline: 2px solid var\(--ink\);/);
});

test('every stretched link turns its own ring off, so focus shows once and round the whole area', () => {
  const links = sources().flatMap((path) =>
    [...code(path).matchAll(/<Link\b[^>]*className="([^"]*after:absolute[^"]*)"/g)].map((m) => ({ path, className: m[1] })),
  );
  assert.ok(links.length >= 4, 'the cards, the featured card, the list row and the posted request row');
  for (const { path, className } of links) assert.match(className, /focus-visible:outline-none/, path);
});
