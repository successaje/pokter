import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * /api/health names the commit the running image was built from, so anyone
 * can tell what is live, and the deploy can check it shipped what it built.
 */

process.env.SATURATION_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-health-')), 'saturation.db');

const SHA = '0ec465ea09481c98937558d1d6e89fbe81cb20b3';

async function commitReported(value: string | undefined): Promise<unknown> {
  if (value === undefined) delete process.env.POKTER_COMMIT;
  else process.env.POKTER_COMMIT = value;
  const { GET } = await import('../../src/app/api/health/route');
  const body = (await GET().json()) as Record<string, unknown>;
  assert.ok('commit' in body, 'always present, null when unknown');
  return body.commit;
}

test('health names the commit it was built from, and null rather than a guess', async () => {
  assert.equal(await commitReported(SHA), SHA);
  assert.equal(await commitReported(` ${SHA.toUpperCase()}\n`), SHA, 'read as given, whatever its case');
  assert.equal(await commitReported(undefined), null, 'a build that was not given one');
  assert.equal(await commitReported(''), null, 'the empty build arg a plain docker build leaves');
  assert.equal(await commitReported('main'), null, 'only a full commit hash');
  assert.equal(await commitReported(SHA.slice(0, 12)), null, 'a short hash can be ambiguous');
});

test('the image is given the commit by the deploy, which then checks production serves it', () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const runner = read('Dockerfile').split('FROM node:24-slim AS runner')[1];
  assert.match(runner, /ARG POKTER_COMMIT\nENV POKTER_COMMIT=\$POKTER_COMMIT\n/, 'in the runner stage, where the server reads it');
  const deploy = read('.github/workflows/deploy.yml');
  assert.match(deploy, /flyctl deploy --remote-only --config fly\.toml --build-arg POKTER_COMMIT="\$\{GITHUB_SHA\}"/);
  assert.match(deploy, /- name: Verify production serves this commit\n/);
  assert.match(deploy, /echo "::error::Production serves \$\{live\}, not \$\{GITHUB_SHA\}\."\n\s+exit 1/);
});
