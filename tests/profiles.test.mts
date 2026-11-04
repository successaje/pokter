import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMessage } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { avatarSrc, EMPTY_PROFILE, handleProblem, isEmptyProfile, linkLabel, normalizeProfile, profileMessage, profilePath, profileProblem, profileUploadMessage, readProfileContent } from '../src/lib/profiles/model';
import { tallyJobs } from '../src/lib/profiles/record';

/*
 * A profile is self-provided, published on purpose, and never credits
 * anyone with work the records do not attribute to them.
 */

const CONTENT = { ...EMPTY_PROFILE, handle: 'ada', displayName: 'Ada', bio: 'I build risk agents.', tags: ['health-factor' as const], links: ['https://github.com/ada'], usage: 'both' as const, published: true, showBuilding: true, agents: ['97:2618'], pinned: ['97:2618'] };
const AT = '2026-10-20T10:00:00.000Z';

test('the signature covers every field, including what is published, and says what it does not prove', async () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const message = profileMessage({ ...CONTENT, wallet: account.address, signedAt: AT });
  assert.match(message, /not that it is true/);
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  for (const changed of [{ ...CONTENT, bio: 'Audited by everyone.' }, { ...CONTENT, tagline: 'Trusted by everyone.' }, { ...CONTENT, theme: 'forest' as const }, { ...CONTENT, published: false }, { ...CONTENT, showHiring: true }, { ...CONTENT, agents: ['97:2618', '56:1'] }, { ...CONTENT, hiddenAgents: ['56:1'] }, { ...CONTENT, usage: 'hire' as const }, { ...CONTENT, showWallet: true }]) {
    assert.equal(await verifyMessage({ address: account.address, message: profileMessage({ ...changed, wallet: account.address, signedAt: AT }), signature }), false);
  }
});

test('publishing needs a handle; indexing needs publishing; pins must be visible agents', () => {
  assert.match(profileProblem({ ...CONTENT, handle: '' }) ?? '', /handle/);
  assert.equal(normalizeProfile({ ...CONTENT, published: false, indexable: true }).indexable, false, 'an unpublished profile is never indexable');
  assert.match(profileProblem({ ...CONTENT, hiddenAgents: ['97:2618'] }) ?? '', /visible agents/);
  assert.equal(profileProblem({ ...CONTENT, agents: [], pinned: ['97:2618'] }), null, 'pinning no longer requires the legacy manual selection');
  assert.ok(profileProblem({ ...CONTENT, agents: ['1:2'] }), 'agents are chain:token on 56 or 97');
  assert.ok(profileProblem({ ...CONTENT, hiddenAgents: ['1:2'] }), 'hidden agents are chain:token on 56 or 97');
  assert.ok(profileProblem({ ...CONTENT, pinned: ['97:1', '97:2', '97:3', '97:4'], agents: ['97:1', '97:2', '97:3', '97:4'] }));
});

test('older signed profiles read with no hidden agents and newer edits cannot smuggle a malformed hide list', () => {
  const legacy: Record<string, unknown> = { ...CONTENT };
  delete legacy.hiddenAgents;
  assert.deepEqual(readProfileContent(legacy)?.hiddenAgents, []);
  assert.equal(readProfileContent({ ...CONTENT, hiddenAgents: '97:2618' }), null);
});

test('a usage choice alone saves a private, otherwise empty profile', () => {
  const onlyUsage = normalizeProfile({ ...EMPTY_PROFILE, usage: 'hire' });
  assert.equal(profileProblem(onlyUsage), null);
  assert.equal(onlyUsage.published, false);
  assert.equal(isEmptyProfile(onlyUsage), false);
  assert.equal(isEmptyProfile(EMPTY_PROFILE), true);
  assert.ok(profileProblem({ ...EMPTY_PROFILE, usage: 'admin' as never }));
});

test('a handle is short, lowercase, and never reads as part of the site or as Pokter', () => {
  assert.equal(handleProblem('ada-builds'), null);
  for (const bad of ['ab', 'Ada', '9lives', 'trailing-', 'a'.repeat(21), 'requests', 'admin', 'pokter-team', 'mypokter']) assert.ok(handleProblem(bad), bad);
  assert.match(profileProblem({ ...CONTENT, displayName: 'Pokter Team' }) ?? '', /Pokter/);
});

test('pictures are uploaded ids and links are https', () => {
  assert.ok(profileProblem({ ...CONTENT, avatar: 'https://example.com/me.png' }));
  assert.equal(avatarSrc('a'.repeat(64)), `/api/profiles/avatar/${'a'.repeat(64)}`);
  assert.ok(profileProblem({ ...CONTENT, links: ['javascript:alert(1)'] }));
  assert.equal(readProfileContent({ ...CONTENT, links: ['ftp://x'] }), null);
  assert.equal(linkLabel('https://www.github.com/ada?tab=repos'), 'github.com');
  assert.equal(profilePath('0xAbC', 'ada'), '/builders/ada');
});

test('an image upload signature binds wallet, network and exact image bytes', async () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const message = profileUploadMessage(account.address, 97, 'a'.repeat(64)) + '\nProfile challenge: one-use';
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  for (const changed of [profileUploadMessage(account.address, 97, 'b'.repeat(64)), profileUploadMessage(account.address, 56, 'a'.repeat(64)), profileUploadMessage('0x00000000000000000000000000000000000000bb', 97, 'a'.repeat(64))]) {
    assert.equal(await verifyMessage({ address: account.address, message: changed + '\nProfile challenge: one-use', signature }), false);
  }
});

test('a profile headline and style are bounded signed presentation, never evidence', () => {
  assert.equal(normalizeProfile({ ...CONTENT, tagline: '  Risk checks   for BNB  ' }).tagline, 'Risk checks for BNB');
  assert.match(profileProblem({ ...CONTENT, tagline: 'a'.repeat(101) }) ?? '', /headline/);
  assert.match(profileProblem({ ...CONTENT, theme: 'official' as never }) ?? '', /style/);
  assert.equal(readProfileContent({ ...CONTENT, theme: 'forest', tagline: 'Risk checks' })?.theme, 'forest');
  const cover = 'a'.repeat(64);
  assert.match(profileMessage({ ...CONTENT, cover, wallet: '0xabc', signedAt: AT }), new RegExp(`Cover: ${cover}`));
  assert.equal(readProfileContent({ ...CONTENT, cover })?.cover, cover);
  assert.match(profileProblem({ ...CONTENT, cover: 'https://example.com/cover.png' }) ?? '', /banner/);
});

test('job states are counted for what they prove, and payment is never called acceptance', () => {
  const jobs = [
    { chainId: 97, status: 'OPEN' as const, client: '0xA' as `0x${string}` },
    { chainId: 97, status: 'FUNDED' as const, client: '0xA' as `0x${string}` },
    { chainId: 97, status: 'SUBMITTED' as const, client: '0xb' as `0x${string}` },
    { chainId: 97, status: 'COMPLETED' as const, client: '0xB' as `0x${string}` },
    { chainId: 97, status: 'REJECTED' as const, client: '0xC' as `0x${string}` },
    { chainId: 97, status: 'EXPIRED' as const, client: '0xD' as `0x${string}` },
    { chainId: 56, status: 'COMPLETED' as const, client: '0xE' as `0x${string}` },
  ];
  assert.deepEqual(tallyJobs(jobs, 97), { funded: 5, submitted: 3, settledUndisputed: 1, rejectedAfterDispute: 1, buyerWallets: 4 });
  assert.deepEqual(tallyJobs(jobs, 56), { funded: 1, submitted: 1, settledUndisputed: 1, rejectedAfterDispute: 0, buyerWallets: 1 }, 'mainnet and testnet are never added together');
});
