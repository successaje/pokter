import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * Every store that defaults to `./data/...` must be pointed at the volume in
 * production. The image cannot create `./data`, so a store added without its
 * path fails at runtime: CONVERSION_DB_PATH was missing for a day, and every
 * Studio with an agent in it failed to load.
 */
const used = new Set(
  execFileSync('git', ['grep', '-hoE', "process\\.env\\.[A-Z_]+_DB_PATH \\?\\? '\\./data", '--', 'src'], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.match(/process\.env\.([A-Z_]+)/)?.[1])
    .filter((name): name is string => Boolean(name)),
);

test('every database path the code reads is set for production', () => {
  assert.ok(used.size > 5, 'expected to find the stores');
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  const fly = readFileSync('fly.toml', 'utf8');
  for (const name of used) {
    assert.match(dockerfile, new RegExp(`ENV ${name}=/data/`), `${name} is not set in the Dockerfile`);
    assert.match(fly, new RegExp(`${name} = '/data/`), `${name} is not set in fly.toml`);
  }
});
