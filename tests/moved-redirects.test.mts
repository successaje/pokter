import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/*
 * A redirect must never shadow a route the app actually defines.
 *
 * `next.config.ts` keeps a `moved` list so every address the previous
 * frontend published still works. When a path on that list later grows a page
 * of its own, the redirect wins and the page becomes unreachable — it exists,
 * it compiles, it is in the sitemap and the footers, and every request to it
 * is answered with a 307 somewhere else. Nothing in lint, typecheck, the test
 * suite or the build can see that: the route and the redirect are both
 * perfectly valid in isolation.
 *
 * This has now happened twice. `/agents` was caught, and a comment was added
 * above the list warning about exactly this; `/leaderboard` then shipped to
 * production anyway, built and registered and 307'd to `/discover`, and was
 * only found by loading the page over `next start`. Twice is the evidence
 * that a comment is the wrong mechanism, so the rule is executable now.
 */
const root = fileURLToPath(new URL('../', import.meta.url));

/** The source paths in the `moved` list, read from the config's own text. */
function movedPaths(): string[] {
  const src = readFileSync(join(root, 'next.config.ts'), 'utf8');
  const block = /const moved: Array<\[string, string\]> = \[([\s\S]*?)\n\s*\];/.exec(src);
  assert.ok(block, 'the moved list is no longer findable — update this test rather than deleting it');
  const paths = [...block[1].matchAll(/\[\s*'([^']+)'\s*,/g)].map((match) => match[1]);
  assert.ok(paths.length > 0, 'the moved list parsed as empty, which would make this test vacuous');
  return paths;
}

/**
 * Every URL path `src/app` defines a page for.
 *
 * Route groups (`(site)`) and parallel slots (`@modal`) contribute no URL
 * segment, so they are walked through without extending the path. Dynamic
 * segments (`[chainId]`) are skipped entirely: this test compares static
 * paths only, which is the whole fault class seen so far and keeps it free of
 * guesses about how a `:param` redirect and a `[param]` route overlap.
 */
function routePaths(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string, segments: string[]) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(entry.name))) {
      found.add(`/${segments.join('/')}`);
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name.startsWith('[')) continue;
      const transparent = name.startsWith('(') || name.startsWith('@') || name.startsWith('_');
      walk(join(dir, name), transparent ? segments : [...segments, name]);
    }
  };
  walk(join(root, 'src', 'app'), []);
  return found;
}

test('no legacy redirect shadows a route the app defines', () => {
  const routes = routePaths();
  /* Guard against the walk silently finding nothing, which would pass. */
  assert.ok(routes.has('/discover'), 'the route walk found no /discover, so it is not reading src/app');

  const collisions = movedPaths()
    .filter((path) => !path.includes(':'))
    .filter((path) => routes.has(path));

  assert.deepEqual(
    collisions,
    [],
    `these paths are both redirected and defined as pages, so the page is unreachable: ${collisions.join(', ')}`,
  );
});

test('the page the last collision hid is defined and no longer redirected', () => {
  assert.ok(routePaths().has('/leaderboard'), '/leaderboard must still have a page');
  assert.ok(
    !movedPaths().includes('/leaderboard'),
    '/leaderboard was returning 307 to /discover on production with its page already built',
  );
});
