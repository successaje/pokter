import assert from 'node:assert/strict';
import test from 'node:test';

import { emailLinkDestination } from '../src/lib/notifications/link-destination';

test('a follow link returns to the agent it is about', () => {
  assert.equal(emailLinkDestination({ kind: 'follow', chainId: 97, tokenId: '2554' }), '/agents/97/2554');
});

test('builder and job links land where those alerts are managed', () => {
  assert.equal(emailLinkDestination({ kind: 'builder' }), '/build');
  assert.equal(emailLinkDestination({ kind: 'buyer' }), '/workspace/inbox');
  assert.equal(emailLinkDestination(null), '/workspace/inbox');
});
