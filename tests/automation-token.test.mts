import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTOMATION_SCOPES,
  DEFAULT_TOKEN_DAYS,
  MAX_TOKEN_DAYS,
  TOKEN_DAY_CHOICES,
  TOKEN_PREFIX,
  automationTokenFromHeader,
  expiryFromDays,
  lastSeen,
  looksLikeAutomationToken,
  readScopes,
  scopeIsForbidden,
  scopeRefusal,
  tokenState,
} from '../src/lib/builders/automation-token';
import { hashAutomationToken, mintAutomationToken } from '../src/lib/builders/automation-secret';

/*
 * The claim this file exists to keep true: an automation token cannot sign
 * a transaction or move money, and that is structural rather than a policy
 * somebody remembered. A scope vocabulary is a list, and a list is where
 * somebody adds `transactions:sign` in six months because a feature wanted
 * it. `scopeIsForbidden` runs over the whole list below, so that addition
 * is a failing suite and not a shipped capability.
 */
test('no scope Pokter can grant is one that signs or spends', () => {
  for (const scope of AUTOMATION_SCOPES) {
    assert.equal(
      scopeIsForbidden(scope.id),
      false,
      `${scope.id} is grantable but names an action Pokter has no key to perform`,
    );
  }
});

test('the forbidden-scope test catches the names somebody would reach for', () => {
  for (const name of [
    'transactions:sign',
    'wallet:sign',
    'funds:transfer',
    'escrow:release',
    'jobs:settle',
    'payments:spend',
    'escrow_dispute',
    'wallet-key',
    'seed:read',
    'account:approve',
  ]) {
    assert.equal(scopeIsForbidden(name), true, `${name} must never be grantable`);
  }
});

test('the ordinary read and write scopes are not caught by it', () => {
  // A predicate that refused everything would pass the test above and be useless.
  for (const name of ['requests:read', 'jobs:read', 'proposals:write', 'deliverables:prepare', 'earnings:read']) {
    assert.equal(scopeIsForbidden(name), false);
  }
});

test('every scope says what it allows, in a sentence a refusal can quote', () => {
  for (const scope of AUTOMATION_SCOPES) {
    assert.match(scope.id, /^[a-z]+:[a-z]+$/);
    assert.ok(scope.label.length > 3, `${scope.id} has no label`);
    assert.ok(scope.what.length > 20, `${scope.id} does not say what it allows`);
  }
});

test('a minted token is prefixed, random, and stored only as a hash', () => {
  const a = mintAutomationToken();
  const b = mintAutomationToken();
  assert.ok(a.token.startsWith(TOKEN_PREFIX));
  assert.notEqual(a.token, b.token, 'two mints must not collide');
  assert.notEqual(a.tokenHash, a.token, 'the stored value must not be the secret');
  assert.equal(a.tokenHash, hashAutomationToken(a.token));
  assert.equal(a.tokenHash.length, 64, 'sha256, hex');
  assert.ok(!a.tokenHash.includes(a.token.slice(TOKEN_PREFIX.length)), 'the hash must not contain the secret');
  assert.equal(a.hint, a.token.slice(-4), 'the listing hint is the last four characters');
  assert.ok(looksLikeAutomationToken(a.token));
});

test('a token is read from the Authorization header and from nowhere else', () => {
  const { token } = mintAutomationToken();
  assert.equal(automationTokenFromHeader(`Bearer ${token}`), token);
  assert.equal(automationTokenFromHeader(`bearer ${token}`), token, 'the scheme is case-insensitive per RFC 7235');
  assert.equal(automationTokenFromHeader(`  Bearer   ${token}  `), token);

  // Not a cookie: a credential readable from one is usable by a cross-site post.
  assert.equal(automationTokenFromHeader(`pokter_builder_session=${token}`), null);
  // Not another scheme, and not a bare value.
  assert.equal(automationTokenFromHeader(token), null);
  assert.equal(automationTokenFromHeader(`Basic ${token}`), null);
  assert.equal(automationTokenFromHeader(''), null);
  assert.equal(automationTokenFromHeader(null), null);
  assert.equal(automationTokenFromHeader(undefined), null);
  // And not something that is merely long: the prefix is checked before any lookup.
  assert.equal(automationTokenFromHeader(`Bearer ${'a'.repeat(50)}`), null);
  assert.equal(automationTokenFromHeader('Bearer pka_short'), null);
  assert.equal(automationTokenFromHeader(`Bearer ${TOKEN_PREFIX}has spaces in it and is long enough`), null);
});

test('scopes are read from a list, refused whole if any is unknown', () => {
  assert.deepEqual(readScopes(['jobs:read']), ['jobs:read']);
  // De-duplicated, and returned in the order they are declared rather than asked for.
  assert.deepEqual(readScopes(['jobs:read', 'requests:read', 'jobs:read']), ['requests:read', 'jobs:read']);
  // One bad entry refuses the lot: a partial grant would be a grant nobody asked for.
  assert.equal(readScopes(['jobs:read', 'transactions:sign']), null);
  assert.equal(readScopes(['*']), null);
  assert.equal(readScopes([]), null, 'a token with no scopes can do nothing and must not be mintable');
  assert.equal(readScopes('jobs:read'), null);
  assert.equal(readScopes(undefined), null);
});

test('a refusal names the missing scope and what to do about it', () => {
  assert.equal(scopeRefusal(['jobs:read'], 'jobs:read'), null);
  assert.equal(scopeRefusal([], null), null, 'a tool that needs no scope is never refused');
  const refusal = scopeRefusal(['jobs:read'], 'deliverables:prepare');
  assert.ok(refusal, 'a missing scope must be refused');
  assert.match(refusal!, /deliverables:prepare/);
  assert.match(refusal!, /\/build\/automation/, 'it must say where to mint one');
  assert.match(refusal!, /never widened/, 'an existing token is not upgraded in place');
});

test('a lifetime is a whole number of days, at most ninety', () => {
  const from = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(expiryFromDays(1, from), '2026-01-02T00:00:00.000Z');
  assert.equal(expiryFromDays(MAX_TOKEN_DAYS, from), '2026-04-01T00:00:00.000Z');
  assert.equal(expiryFromDays(0, from), null);
  assert.equal(expiryFromDays(-7, from), null);
  assert.equal(expiryFromDays(MAX_TOKEN_DAYS + 1, from), null);
  assert.equal(expiryFromDays(1.5, from), null);
  assert.equal(expiryFromDays(Number.NaN, from), null);
  assert.ok(TOKEN_DAY_CHOICES.includes(DEFAULT_TOKEN_DAYS), 'the default must be one of the offered choices');
  for (const choice of TOKEN_DAY_CHOICES) assert.ok(expiryFromDays(choice, from), `${choice} days must be mintable`);
});

/*
 * The page and the API must never disagree about whether a token is live.
 * A token that was revoked and has since also expired reads as "Revoked",
 * because that is the fact its owner acted on.
 */
test('a token state is one answer, with revocation ahead of expiry', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z');
  const future = '2026-07-01T00:00:00.000Z';
  const past = '2026-05-01T00:00:00.000Z';
  assert.deepEqual(tokenState({ revokedAt: null, expiresAt: future }, now), { label: 'Active', live: true });
  assert.deepEqual(tokenState({ revokedAt: null, expiresAt: past }, now), { label: 'Expired', live: false });
  assert.deepEqual(tokenState({ revokedAt: past, expiresAt: future }, now), { label: 'Revoked', live: false });
  assert.deepEqual(tokenState({ revokedAt: past, expiresAt: past }, now), { label: 'Revoked', live: false });
  // Exactly at its expiry it is expired: the lookup's `expires_at > ?` agrees.
  assert.equal(tokenState({ revokedAt: null, expiresAt: new Date(now).toISOString() }, now).live, false);
});

/*
 * Pokter cannot see whether somebody's assistant is running — it runs on
 * their machine — so the only honest signal is when it last called. This
 * must never read as "online".
 */
test('last-seen reports a call, never a status', () => {
  const now = Date.parse('2026-06-01T12:00:00.000Z');
  assert.equal(lastSeen(null, now), 'Never used');
  assert.equal(lastSeen('not a date', now), 'Never used');
  assert.equal(lastSeen('2026-06-01T11:59:40.000Z', now), 'Last call under a minute ago');
  assert.equal(lastSeen('2026-06-01T11:59:00.000Z', now), 'Last call 1 minute ago');
  assert.equal(lastSeen('2026-06-01T11:30:00.000Z', now), 'Last call 30 minutes ago');
  assert.equal(lastSeen('2026-06-01T09:00:00.000Z', now), 'Last call 3 hours ago');
  assert.equal(lastSeen('2026-05-28T12:00:00.000Z', now), 'Last call 4 days ago');
  for (const at of [null, '2026-06-01T11:00:00.000Z', '2026-05-01T00:00:00.000Z']) {
    assert.doesNotMatch(lastSeen(at, now), /online|offline|running|live/i);
  }
});
