import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { API_CHANGES } from '../src/lib/api/changes';

/*
 * API changes are published where callers look: /developers#api-changes and
 * the /api/v1 index. The receipt verifier lost `completedValueRaw` on 26
 * October with a migration note only in the repository.
 */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('every change is dated and released, or unreleased with neither, classified, and newest first', () => {
  assert.ok(API_CHANGES.length > 0);
  for (const change of API_CHANGES) {
    if (change.release === null) {
      /* Not deployed yet: no guessed release, and no date it has not gone live on. */
      assert.equal(change.date, null, change.summary);
    } else {
      assert.match(String(change.date), /^\d{4}-\d{2}-\d{2}$/, change.summary);
      assert.match(change.release, /^v\d+$/, change.summary);
    }
    assert.ok(['breaking', 'changed', 'added'].includes(change.kind), change.summary);
    assert.ok(change.surfaces.length > 0 && change.details.length > 0, change.summary);
    /* A field that was removed or now means something else tells the caller what to do. */
    if (change.kind !== 'added') assert.ok(change.migrate, `${change.summary} says how to migrate`);
  }
  const unreleased = API_CHANGES.findIndex((c) => c.release !== null);
  assert.ok(API_CHANGES.slice(unreleased).every((c) => c.release !== null), 'unreleased changes come first');
  const dates = API_CHANGES.slice(unreleased).map((c) => String(c.date));
  assert.deepEqual(dates, [...dates].sort().reverse(), 'newest first');
  assert.match(source('src/app/(site)/developers/page.tsx'), /change\.release \? `\$\{change\.date\} · \$\{change\.release\}` : 'Unreleased'/);
});

test('the receipt verifier migration is published with what replaced the field', () => {
  const verifier = API_CHANGES.find((c) => c.surfaces.includes('GET /api/v1/receipts/verifier'));
  assert.ok(verifier);
  assert.equal(verifier.kind, 'breaking');
  assert.equal(verifier.release, 'v541');
  const all = verifier.details.join(' ');
  assert.match(all, /Removed: `byChain\[\]\.completedValueRaw`/);
  assert.match(all, /`byChain\[\]\.completedByToken`/);
  assert.match(all, /null means unread, never \$U/);
  assert.match(verifier.migrate ?? '', /0xcE24439F2D9C6a2289F741120FE202248B666666 on 56, 0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565 on 97/);
  /* What the verifier actually returns today. */
  const code = source('src/lib/proof/verifier.ts');
  assert.match(code, /completedByToken: completedByToken\(chain\)/);
  assert.doesNotMatch(code, /completedValueRaw: chain/);
});

test('the list is served on the developers page and in the API index', () => {
  const page = source('src/app/(site)/developers/page.tsx');
  assert.match(page, /\{ id: 'api-changes', label: 'API changes' \}/);
  assert.match(page, /API_CHANGES\.map\(/);
  const index = source('src/app/api/v1/route.ts');
  assert.match(index, /changes: API_CHANGES,/);
});
