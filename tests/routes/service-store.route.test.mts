import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('service revisions preserve prior scope and archive never deletes history', async () => {
  const { ServiceStore } = await import('../../src/lib/services/store');
  const store = new ServiceStore(join(mkdtempSync(join(tmpdir(), 'pokter-service-')), 'services.db'));
  const builder = '0x00000000000000000000000000000000000000bb';
  const content = { title: 'Risk report', description: 'Review positions and explain liquidation exposure.', buyerProvides: 'Wallet and risk limits', delivers: 'A written report with sources', category: 'health-factor', chainId: 97 as const, tokenId: '2225', status: 'active' as const };
  const first = store.save(null, builder, content);
  assert.equal(store.list().total, 1);
  const second = store.save(first.id, builder, { ...content, delivers: 'A CSV and written report' });
  assert.equal(second.revision, 2);
  assert.equal(store.revision(first.id, 1)?.delivers, content.delivers);
  assert.equal(store.revision(first.id, 2)?.delivers, 'A CSV and written report');
  assert.throws(() => store.save(first.id, '0x00000000000000000000000000000000000000cc', content));
  assert.throws(() => store.save(first.id, builder, { ...content, tokenId: '999' }));
  store.save(first.id, builder, { ...content, status: 'archived' });
  assert.equal(store.list().total, 0);
  assert.ok(store.revision(first.id, 1));
  assert.throws(() => store.save(first.id, builder, content));
});

test('profile challenges expire in storage and cannot be consumed twice', async () => {
  const { ProfileStore } = await import('../../src/lib/profiles/store');
  const store = new ProfileStore(join(mkdtempSync(join(tmpdir(), 'pokter-profile-')), 'profiles.db'));
  const wallet = '0x00000000000000000000000000000000000000bb';
  const challenge = store.createChallenge(wallet, 97);
  assert.match(challenge.suffix, /Pokter domain:/);
  assert.equal(store.challenge(challenge.id, wallet, 56), null);
  assert.equal(store.challenge(challenge.id, wallet, 97), challenge.suffix);
  assert.equal(store.consumeChallenge(challenge.id), true);
  assert.equal(store.consumeChallenge(challenge.id), false);
  assert.equal(store.challenge(challenge.id, wallet, 97), null);
});
