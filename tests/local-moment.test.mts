import assert from 'node:assert/strict';
import test from 'node:test';

import { localMoment } from '../src/lib/time/local-moment';

test('a local time renders instead of throwing', () => {
  // Job 57017's page crashed on "Invalid option : option" from dateStyle with timeZoneName.
  const text = localMoment(1792161000, 'en-GB');
  assert.match(text, /2026/);
  assert.match(text, /Oct/);
  assert.ok(/[A-Z]{2,}|GMT|UTC/.test(text), `names a timezone: ${text}`);
});
