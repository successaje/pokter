import assert from 'node:assert/strict';
import test from 'node:test';

import {
  draftProgress,
  draftTitle,
  isDraftEmpty,
  listDrafts,
  migrateLegacyDraft,
  removeDraft,
  upsertDraft,
  type DraftFields,
  type DraftRecord,
} from '../src/lib/builder/drafts';

const empty: DraftFields = {
  name: '', description: '', category: '', protocol: 'a2a',
  endpoint: '', image: '', repository: '',
};
const filled = (over: Partial<DraftFields> = {}): DraftFields => ({ ...empty, ...over });
const entry = (id: string, updatedAt: string, draft = filled({ name: id })) =>
  ({ id, draft, mode: 'new' as const, step: 1, updatedAt });

test('drafts list newest first', () => {
  let record: DraftRecord = {};
  record = upsertDraft(record, entry('older', '2026-10-01T00:00:00Z'));
  record = upsertDraft(record, entry('newest', '2026-10-05T00:00:00Z'));
  record = upsertDraft(record, entry('middle', '2026-10-03T00:00:00Z'));
  assert.deepEqual(listDrafts(record).map((d) => d.id), ['newest', 'middle', 'older']);
});

test('saving the same draft twice updates it rather than duplicating', () => {
  let record: DraftRecord = {};
  record = upsertDraft(record, entry('a', '2026-10-01T00:00:00Z'));
  record = upsertDraft(record, entry('a', '2026-10-02T00:00:00Z', filled({ name: 'renamed' })));
  assert.equal(listDrafts(record).length, 1);
  assert.equal(listDrafts(record)[0].draft.name, 'renamed');
});

test('deleting removes only the one asked for', () => {
  let record: DraftRecord = {};
  record = upsertDraft(record, entry('a', '2026-10-01T00:00:00Z'));
  record = upsertDraft(record, entry('b', '2026-10-02T00:00:00Z'));
  record = removeDraft(record, 'a');
  assert.deepEqual(Object.keys(record), ['b']);
});

/*
 * Somebody mid-build when this ships must not lose their work, and must
 * not come back to two copies of it either.
 */
test('the single old draft is carried over exactly once', () => {
  const legacy = { draft: filled({ name: 'Keelhaul' }), mode: 'new' as const, step: 2 };
  const first = migrateLegacyDraft({}, legacy, '2026-10-05T00:00:00Z', 'id-1');
  assert.equal(listDrafts(first).length, 1);
  assert.equal(listDrafts(first)[0].draft.name, 'Keelhaul');
  assert.equal(listDrafts(first)[0].step, 2);

  const again = migrateLegacyDraft(first, legacy, '2026-10-05T00:01:00Z', 'id-2');
  assert.equal(listDrafts(again).length, 1, 'migrating twice must not duplicate');
});

test('an empty legacy slot is not carried over at all', () => {
  assert.deepEqual(migrateLegacyDraft({}, { draft: empty }, 'now', 'id'), {});
  assert.deepEqual(migrateLegacyDraft({}, null, 'now', 'id'), {});
});

test('a draft is titled by what the builder actually typed', () => {
  assert.equal(draftTitle(filled({ name: 'Keelhaul' })), 'Keelhaul');
  assert.equal(
    draftTitle(filled({ description: 'Watches a Venus borrow position. And more.' })),
    'Watches a Venus borrow position',
  );
  assert.equal(draftTitle(empty), 'Untitled draft');
});

test('a very long description is trimmed for the list', () => {
  const title = draftTitle(filled({ description: 'x'.repeat(200) }));
  assert.ok(title.length <= 48, title.length.toString());
  assert.match(title, /…$/);
});

test('progress counts what is filled in', () => {
  assert.deepEqual(draftProgress(empty), { done: 0, total: 4 });
  assert.deepEqual(
    draftProgress(filled({ name: 'Keelhaul', description: 'x'.repeat(40), category: 'yield' })),
    { done: 3, total: 4 },
  );
});

test('emptiness is judged on everything a builder could have typed', () => {
  assert.equal(isDraftEmpty(empty), true);
  assert.equal(isDraftEmpty(filled({ repository: 'https://example.com' })), false);
  assert.equal(isDraftEmpty(filled({ protocol: 'mcp' })), true, 'a default protocol is not input');
});
