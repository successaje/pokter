import assert from 'node:assert/strict';
import test from 'node:test';

import { requestHrefFor } from '../src/features/discover/params';

test('a search becomes the title of a new request, trimmed and encoded', () => {
  assert.equal(requestHrefFor('  Translate Korean subtitles '), '/workspace/requests/new?title=Translate%20Korean%20subtitles');
  assert.equal(requestHrefFor('a&b=c #d'), '/workspace/requests/new?title=a%26b%3Dc%20%23d');
});

test('an empty search opens a blank request, and a long one is cut to a title', () => {
  assert.equal(requestHrefFor('   '), '/workspace/requests/new');
  const href = requestHrefFor('x'.repeat(300));
  assert.equal(decodeURIComponent(href.split('title=')[1]).length, 120);
});
