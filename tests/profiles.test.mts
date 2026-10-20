import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMessage } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { isEmptyProfile, linkLabel, normalizeProfile, profileMessage, profileProblem, readProfileContent } from '../src/lib/profiles/model';

/*
 * A profile is self-provided. These pin what the signature covers, what
 * is refused, and that nothing a person types can make it read as Pokter.
 */

const CONTENT = { displayName: 'Ada', bio: 'I build risk agents.', avatarUrl: '', links: ['https://github.com/ada'] };
const AT = '2026-10-20T10:00:00.000Z';

test('the signature covers every field, and says what it does not prove', async () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const message = profileMessage({ ...CONTENT, wallet: account.address, signedAt: AT });
  assert.match(message, /not that it is true/);
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  const changed = profileMessage({ ...CONTENT, bio: 'Audited by everyone.', wallet: account.address, signedAt: AT });
  assert.equal(await verifyMessage({ address: account.address, message: changed, signature }), false);
});

test('a name cannot read as Pokter speaking', () => {
  assert.match(profileProblem({ ...CONTENT, displayName: 'Pokter Team' }) ?? '', /Pokter/);
  assert.match(profileProblem({ ...CONTENT, displayName: 'official-POKTER' }) ?? '', /Pokter/);
  assert.equal(profileProblem(CONTENT), null);
});

test('pictures and links must be https, and within the limits', () => {
  assert.ok(profileProblem({ ...CONTENT, avatarUrl: 'http://x.test/a.png' }));
  assert.ok(profileProblem({ ...CONTENT, links: ['javascript:alert(1)'] }));
  assert.ok(profileProblem({ ...CONTENT, links: ['https://a.test', 'https://b.test', 'https://c.test', 'https://d.test'] }));
  assert.ok(profileProblem({ ...CONTENT, bio: 'x'.repeat(281) }));
  assert.equal(readProfileContent({ ...CONTENT, links: ['ftp://x'] }), null);
});

test('what is signed is what is stored: whitespace is normalised before both', () => {
  const typed = { displayName: '  Ada   Lovelace ', bio: ' hi ', avatarUrl: ' ', links: [' https://a.test ', ''] };
  assert.deepEqual(normalizeProfile(typed), { displayName: 'Ada Lovelace', bio: 'hi', avatarUrl: '', links: ['https://a.test'] });
  assert.deepEqual(readProfileContent(typed), normalizeProfile(typed));
});

test('empty content clears a profile, and links show only their host', () => {
  assert.equal(isEmptyProfile({ displayName: '', bio: '', avatarUrl: '', links: [] }), true);
  assert.equal(linkLabel('https://www.github.com/ada?tab=repos'), 'github.com');
});
