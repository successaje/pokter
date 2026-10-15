import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/*
 * Every call to an A2A agent goes to the interface `jsonRpcEndpoint` picks
 * from its card. The free preview route shipped calling `card.url` after
 * the others had moved, which sends JSON-RPC to whatever the top-level URL
 * is (gRPC or HTTP+JSON on some v0.3 cards) and fails on current cards
 * that have none. This keeps a new call site from doing the same.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

test('no code calls an agent card’s top-level url directly', () => {
  const root = new URL('../src', import.meta.url).pathname;
  const offenders = files(root)
    .filter((path) => !path.endsWith(join('lib', 'a2a', 'card.ts')))
    .filter((path) => /\bcard\??\.url\b/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(offenders, []);
});
