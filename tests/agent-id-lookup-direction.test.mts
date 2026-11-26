import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/*
 * Pokter shows a wallet by the handle of its Agent ID, and never the other
 * way round. The registry also maps a handle to its owner; a call to it
 * anywhere in the product would make Agent ID a way to look up other
 * people's wallets by name.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|mjs)$/.test(name) ? [path] : [];
  });
}

test('nothing in the product looks up a wallet by its Agent ID name', () => {
  const root = new URL('..', import.meta.url).pathname;
  const found = ['src', 'scripts'].flatMap((dir) => files(join(root, dir))).filter((path) => /ownerOfHandle/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(found.map((path) => path.slice(root.length)), []);
});
