import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * Tests call the code and check what it does. A test that reads a source
 * file and matches its text checks wording, not behaviour: it passes while
 * the code is wrong and fails when correct code is reworded. 116 such files
 * exist and are listed in fixtures/source-reading-tests.json. The list can
 * only shrink: a new one fails here by name, and one converted to a real test
 * must come off the list.
 *
 * Repository-wide rules that walk the source tree (which module may build a
 * card URL, what the Docker image leaves out) are not this, and the pattern
 * below does not catch them.
 */

const ALLOWED: string[] = JSON.parse(readFileSync(new URL('./fixtures/source-reading-tests.json', import.meta.url), 'utf8'));
const SELF = 'tests/test-policy.test.mts';

function testFiles(): string[] {
  const list = (dir: string) => readdirSync(new URL(`../${dir}`, import.meta.url)).filter((name) => name.endsWith('.test.mts')).map((name) => `${dir}/${name}`);
  return [...list('tests'), ...list('tests/routes')].filter((path) => path !== SELF);
}

function readsSource(path: string): boolean {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  return /readFileSync/.test(text) && /(?:\.\.\/)+src\/|['`"]src\//.test(text);
}

test('no new test checks source text instead of behaviour', () => {
  const reading = testFiles().filter(readsSource);
  const added = reading.filter((path) => !ALLOWED.includes(path));
  assert.deepEqual(added, [], 'These read a source file and match its text. Import the code and test what it does instead.');
});

test('a test converted to check behaviour comes off the list, so the list only shrinks', () => {
  const reading = new Set(testFiles().filter(readsSource));
  const stale = ALLOWED.filter((path) => !reading.has(path));
  assert.deepEqual(stale, [], 'These no longer read source (or no longer exist). Remove them from tests/fixtures/source-reading-tests.json.');
});
