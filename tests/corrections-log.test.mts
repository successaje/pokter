import assert from 'node:assert/strict';
import test from 'node:test';

import { CORRECTIONS } from '../src/lib/corrections/entries';

/*
 * The corrections page says every figure, label or rule Pokter published
 * that turned out to be wrong is listed there. It went from 17 October to
 * mid-November without an entry while several were fixed.
 */

test('the log is newest first, and each entry is complete', () => {
  for (let i = 1; i < CORRECTIONS.length; i += 1) {
    assert.ok(CORRECTIONS[i - 1].date >= CORRECTIONS[i].date, `${CORRECTIONS[i - 1].title} is listed before an older entry`);
  }
  for (const c of CORRECTIONS) {
    assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/);
    for (const field of [c.title, c.said, c.true, c.found]) assert.ok(field.trim().length > 0, c.title);
  }
});

test('the November fixes are on the record, each with the pull request that made it', () => {
  const byTitle = (pattern: RegExp) => CORRECTIONS.find((c) => pattern.test(c.title));
  /* #448 corrected the risk disclosure #442 missed. */
  assert.deepEqual(byTitle(/only the buyer could refund an expired job/)?.prs, [442, 448]);
  assert.deepEqual(byTitle(/jobs paid to Pokter’s courier as the agent’s paid work/)?.prs, [445]);
  assert.deepEqual(byTitle(/did say which block they read/)?.prs, [445]);
  assert.deepEqual(byTitle(/quote signature BNB’s agent SDK refuses/)?.prs, [446]);
  assert.deepEqual(byTitle(/release by itself when the review window closed/)?.prs, [448]);
  assert.deepEqual(byTitle(/“attested” a narrower meaning/)?.prs, [448]);
});
