import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { STORES, isDurable, storePath } from '../src/lib/health/stores';

/*
 * The list of stores drifted from the code once already, and quietly.
 *
 * The health check carried eight entries while sixteen stores existed, so
 * half of them went unchecked and the output still said `persistent: true` —
 * because the eight it knew about were all on the volume. The briefs store
 * would have been the first real cost of that: its path was never added to
 * fly.toml, so it would have been written to a directory that does not
 * survive a deploy, and every brief and bid would have vanished on the next
 * one with nothing reporting it.
 *
 * Closing the gap once is not enough, because what went wrong was a list
 * that had to be remembered. These tests read the source and hold the
 * registry to it, so the next store added and not registered fails here
 * rather than in production.
 *
 * Whether a store's path is actually set for production is checked by
 * `data-paths.test.mts`, which was here first and does it better: it covers
 * the Dockerfile as well as fly.toml, and the image is what the container
 * runs. It caught the briefs store's missing `ENV` line while this file's
 * first draft — which looked only at fly.toml — passed. Deployment coverage
 * belongs there, not duplicated here.
 */

/** Every `*_DB_PATH` the source actually reads, with the default beside it. */
function storesInSource(): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /process\.env\.([A-Z_0-9]*DB_PATH)\s*\?\?\s*'([^']+)'/g;

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        // The registry itself names every variable; it is the thing under test.
        if (path.endsWith(join('lib', 'health', 'stores.ts'))) continue;
        for (const [, variable, fallback] of readFileSync(path, 'utf8').matchAll(pattern)) {
          found.set(variable, fallback);
        }
      }
    }
  };

  walk('src');
  return found;
}

test('every store the code opens is in the registry', () => {
  const registered = new Set(STORES.map((store) => store.variable));
  const missing = [...storesInSource().keys()].filter((variable) => !registered.has(variable));

  assert.deepEqual(
    missing,
    [],
    `these stores are opened by the code but unknown to the health check: ${missing.join(', ')}`,
  );
});

test('the registry does not name a store the code no longer opens', () => {
  // The other direction. A stale entry reports on a file nobody writes, which
  // is a check that passes while measuring nothing.
  const inSource = storesInSource();
  const stale = STORES.filter((store) => !inSource.has(store.variable)).map((s) => s.variable);

  assert.deepEqual(stale, [], `registered but never read: ${stale.join(', ')}`);
});

test('the registry records the same fallback the code uses', () => {
  // The fallback is what decides `persistent` when the variable is unset, so
  // a registry that guesses it wrong reports durability it cannot promise.
  const inSource = storesInSource();
  for (const store of STORES) {
    assert.equal(
      store.fallback,
      inSource.get(store.variable),
      `${store.variable}: the registry and the store disagree about where it goes by default`,
    );
  }
});

test('no fallback is mistaken for a durable path', () => {
  // If one ever were, an unset variable would report `persistent: true` while
  // writing to a directory the next deploy replaces.
  for (const store of STORES) {
    assert.equal(isDurable(store.fallback), false, `${store.variable}'s fallback claims durability`);
  }
});

test('a store reads its path from the environment, and says when it is not durable', () => {
  const store = STORES.find((s) => s.variable === 'BRIEF_DB_PATH');
  assert.ok(store, 'the briefs store is registered');

  const original = process.env.BRIEF_DB_PATH;
  try {
    delete process.env.BRIEF_DB_PATH;
    assert.equal(storePath(store), './data/briefs.db');
    assert.equal(isDurable(storePath(store)), false, 'unset is not durable');

    process.env.BRIEF_DB_PATH = '/data/briefs.db';
    assert.equal(isDurable(storePath(store)), true);
  } finally {
    if (original === undefined) delete process.env.BRIEF_DB_PATH;
    else process.env.BRIEF_DB_PATH = original;
  }
});
