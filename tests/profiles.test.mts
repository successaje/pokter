import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMessage } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { avatarSrc, handleProblem, isEmptyProfile, linkLabel, normalizeProfile, profileMessage, profilePath, profileProblem, readProfileContent } from '../src/lib/profiles/model';

/*
 * A profile is self-provided. These pin what the signature covers, what
 * is refused, and that nothing a person types can make it read as Pokter.
 */

const CONTENT = { handle: 'ada', displayName: 'Ada', bio: 'I build risk agents.', avatar: '', tags: ['health-factor' as const], links: ['https://github.com/ada'] };
const AT = '2026-10-20T10:00:00.000Z';

test('the signature covers every field, and says what it does not prove', async () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const message = profileMessage({ ...CONTENT, wallet: account.address, signedAt: AT });
  assert.match(message, /not that it is true/);
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  for (const changed of [{ ...CONTENT, bio: 'Audited by everyone.' }, { ...CONTENT, handle: 'someone-else' }, { ...CONTENT, tags: [] }]) {
    assert.equal(await verifyMessage({ address: account.address, message: profileMessage({ ...changed, wallet: account.address, signedAt: AT }), signature }), false);
  }
});

test('a handle is short, lowercase, and never reads as part of the site or as Pokter', () => {
  assert.equal(handleProblem('ada-builds'), null);
  assert.equal(handleProblem(''), null, 'a handle is optional');
  for (const bad of ['ab', 'Ada', '9lives', 'trailing-', 'a'.repeat(21), 'requests', 'admin', 'pokter-team', 'mypokter']) {
    assert.ok(handleProblem(bad), bad);
  }
});

test('a name cannot read as Pokter speaking, and tags come from the agent categories', () => {
  assert.match(profileProblem({ ...CONTENT, displayName: 'Pokter Team' }) ?? '', /Pokter/);
  assert.ok(profileProblem({ ...CONTENT, tags: ['memecoins' as never] }));
  assert.equal(profileProblem(CONTENT), null);
});

test('pictures are uploaded ids, links must be https, and both stay within limits', () => {
  assert.ok(profileProblem({ ...CONTENT, avatar: 'https://example.com/me.png' }), 'no hot-linked pictures');
  assert.equal(profileProblem({ ...CONTENT, avatar: 'a'.repeat(64) }), null);
  assert.equal(avatarSrc('a'.repeat(64)), `/api/profiles/avatar/${'a'.repeat(64)}`);
  assert.equal(avatarSrc(''), null);
  assert.ok(profileProblem({ ...CONTENT, links: ['javascript:alert(1)'] }));
  assert.ok(profileProblem({ ...CONTENT, links: ['https://a.test', 'https://b.test', 'https://c.test', 'https://d.test'] }));
  assert.ok(profileProblem({ ...CONTENT, bio: 'x'.repeat(281) }));
});

test('what is signed is what is stored: input is normalised before both', () => {
  const typed = { handle: ' Ada ', displayName: '  Ada   Lovelace ', bio: ' hi ', avatar: ' ', tags: ['token-safety' as const, 'yield' as const], links: [' https://a.test ', ''] };
  const clean = normalizeProfile(typed);
  assert.deepEqual(clean, { handle: 'ada', displayName: 'Ada Lovelace', bio: 'hi', avatar: '', tags: ['yield', 'token-safety'], links: ['https://a.test'] });
  assert.deepEqual(readProfileContent(typed), clean);
});

test('a profile lives at its handle once it has one', () => {
  assert.equal(profilePath('0xAbC', 'ada'), '/builders/ada');
  assert.equal(profilePath('0xAbC', ''), '/builders/0xAbC');
  assert.equal(isEmptyProfile({ handle: '', displayName: '', bio: '', avatar: '', tags: [], links: [] }), true);
  assert.equal(linkLabel('https://www.github.com/ada?tab=repos'), 'github.com');
});
