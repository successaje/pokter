import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/*
 * An agent the product shows is an agent the product checks. The sweep read
 * twelve a category while the catalogue listed up to four hundred, and on
 * 25 November fifteen listed agents with working addresses had never been
 * probed. The sweep now reads `CATALOGUE_PER_CATEGORY` (asserted where the
 * sweep can be imported, tests/routes/awaiting-agent-surfaces), and this
 * keeps any caller from listing the catalogue deeper than that.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = new URL('../src', import.meta.url).pathname;
const { CATALOGUE_PER_CATEGORY } = (await import(join(root, 'lib/agents/categories.ts'))) as { CATALOGUE_PER_CATEGORY: number };

test('nothing lists the catalogue deeper than the sweep measures', () => {
  const deeper = files(root).flatMap((path) =>
    [...readFileSync(path, 'utf8').matchAll(/list(?:Searchable|Marketplace)(?:WithStatus)?\(\{[^}]*\blimit: (\d+)/g)]
      .filter((match) => Number(match[1]) > CATALOGUE_PER_CATEGORY)
      .map((match) => `${path.slice(root.length)}: ${match[0]}`),
  );
  assert.deepEqual(deeper, []);
});
