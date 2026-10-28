import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * Building's job list, calmer: every row laid out the same way, and the
 * overview's "Active jobs" only the jobs whose money the escrow still holds.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a job row keeps its status and amount on the right, whatever the length of the brief', () => {
  const inbox = code('features/studio/DeliveryInbox.tsx');
  assert.match(inbox, /grid grid-cols-\[minmax\(0,1fr\)_auto\]/, 'two columns, not a wrapping row');
  assert.doesNotMatch(inbox, /flex flex-wrap items-start justify-between gap-3/, 'the row that dropped the status under a long brief is gone');
  assert.match(inbox, /<p className="truncate text-\[13px\] text-ink-2" title=\{job\.task\}>/, 'the brief is one line, all of it on hover');
  assert.match(inbox, /<Link href=\{jobHref\(job\)\} className="truncate text-sm font-medium hover:underline">/, 'the name is the way to the job');
  assert.doesNotMatch(inbox, /· View job/);
});

test('the overview lists active jobs only, and says so when there are none', () => {
  const page = code('app/(site)/build/(section)/page.tsx');
  assert.match(page, /const active = jobs\.filter\(\(j\) => j\.status === 'FUNDED' \|\| j\.status === 'SUBMITTED'\);/);
  assert.match(page, /<DeliveryInbox\s+jobs=\{active\}/);
  assert.match(page, /Nothing needs you right now\. Paid and expired jobs are under All jobs\./);
  /* The full list stays whole. */
  assert.match(code('app/(site)/build/(section)/jobs/page.tsx'), /<DeliveryInbox jobs=\{jobs\} staged=\{staged\} \/>/);
});
