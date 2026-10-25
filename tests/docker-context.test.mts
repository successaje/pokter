import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

/*
 * `src` may not import from a directory the Fly image does not contain.
 *
 * `.dockerignore` excludes `docs`, `scripts` and `tests`, so anything
 * under `src` that imports from them resolves locally, type-checks
 * locally, passes every test locally — and fails inside the image, where
 * the file is simply not there. The failure appears at deploy time, on
 * main, after the merge.
 *
 * That is not hypothetical: PR #304's deploy failed exactly this way
 * when `tests/proofrun-verify-cli.test.mts` imported `scripts/`, and it
 * took a follow-up (#305) to unbreak production. This checks the
 * direction that still matters — nothing excluded may be a dependency of
 * what ships — rather than the pair that happened to break that day.
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Directories `.dockerignore` keeps out of the image, read from the file itself. */
function excludedDirectories(): string[] {
  const text = readFileSync(join(ROOT, '.dockerignore'), 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('!'))
    .map((line) => line.replace(/^\/+|\/+$/g, ''))
    .filter((line) => ['docs', 'scripts', 'tests'].includes(line));
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) found.push(path);
  }
  return found;
}

test('nothing under src imports from a directory the image leaves out', () => {
  const excluded = excludedDirectories();
  assert.ok(excluded.length === 3, `expected docs, scripts and tests to be excluded; .dockerignore lists ${excluded.join(', ') || 'none of them'}`);

  const offenders: string[] = [];
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      /* Both spellings reach the same place: a relative climb out of src,
         and the `@/` alias with a climb inside it. */
      const climbs = specifier.startsWith('.') || specifier.startsWith('@/');
      if (!climbs) continue;
      if (excluded.some((dir) => new RegExp(`(^|/)${dir}/`).test(specifier))) {
        offenders.push(`${relative(ROOT, file)} imports ${specifier}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these would resolve locally and be missing from the Fly image:\n  ${offenders.join('\n  ')}`,
  );
});

/*
 * The guard above is only as good as the exclusion list it reads. If
 * `.dockerignore` stopped excluding these, the rule would pass by
 * becoming vacuous rather than by being satisfied — so the list is
 * asserted directly, and a deliberate change to it has to come here too.
 */
test('the image still leaves out docs, scripts and tests', () => {
  const excluded = excludedDirectories();
  for (const dir of ['docs', 'scripts', 'tests']) {
    assert.ok(excluded.includes(dir), `.dockerignore no longer excludes ${dir}, so the import guard above is checking nothing`);
  }
});
