import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { NEVER_ASK_FOR_KEYS, WALLET_ROLES, walletRoleConflicts } from '../src/lib/builder/wallet-roles';
import { BUILD_QUALIFICATION, CAMPAIGN_IS_SEPARATE, EXECUTION_ONLY_REQUIREMENTS } from '../src/lib/campaign/build-qualification';

const A = '0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = '0xcccccccccccccccccccccccccccccccccccccccc';

test('the three roles are described separately, each with a key location and a limit', () => {
  assert.deepEqual(WALLET_ROLES.map((role) => role.id), ['identity-owner', 'agent-wallet', 'test-buyer']);
  for (const role of WALLET_ROLES) {
    assert.ok(role.purpose.length > 30, role.id);
    assert.ok(role.signs.length > 20, role.id);
    assert.ok(role.keyLives.length > 20, role.id);
    assert.ok(role.neverDoes.length > 20, role.id);
  }
});

test('three distinct wallets conflict with nothing', () => {
  assert.deepEqual(walletRoleConflicts({ identityOwner: A, agentWallet: B, testBuyer: C }), []);
});

/*
 * The escrow refuses this one outright, and two mainnet jobs were funded
 * that way before anything said so. It is the only blocking overlap.
 */
test('a test buyer that is the provider is blocking, and nothing else is', () => {
  const blocking = walletRoleConflicts({ identityOwner: A, agentWallet: B, testBuyer: B });
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].severity, 'blocking');
  assert.deepEqual(blocking[0].roles, ['agent-wallet', 'test-buyer']);
  /* The overlap is real and blocking; the reason given for it is the
     hire page, not a contract that would have accepted the job. */
  assert.match(blocking[0].consequence, /hire page refuses to fund it/i);
  assert.doesNotMatch(blocking[0].consequence, /can never be completed by anyone/i);

  for (const assignment of [
    { identityOwner: A, agentWallet: A, testBuyer: B },
    { identityOwner: A, agentWallet: B, testBuyer: A },
  ]) {
    const conflicts = walletRoleConflicts(assignment);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].severity, 'advised', JSON.stringify(assignment));
    assert.ok(conflicts[0].fix.length > 10);
  }
});

test('address comparison ignores case and surrounding space', () => {
  const conflicts = walletRoleConflicts({ agentWallet: ` ${A.toLowerCase()} `, testBuyer: A.toUpperCase() });
  assert.equal(conflicts.length, 1);
});

test('an unknown address never invents a conflict', () => {
  assert.deepEqual(walletRoleConflicts({ identityOwner: A, agentWallet: null, testBuyer: undefined }), []);
  assert.deepEqual(walletRoleConflicts({}), []);
});

test('the no-keys line is stated once and says it plainly', () => {
  assert.match(NEVER_ASK_FOR_KEYS, /never asks for a private key or a recovery phrase/i);
});

/*
 * Not a style rule. A field that takes a private key or a seed phrase is
 * the single worst thing this product could grow, and a grep is the only
 * check that keeps holding after everybody who read this has moved on.
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(path);
  }
  return found;
}

test('no input anywhere under src asks for a private key or a recovery phrase', () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    /* Labels, placeholders and hints — the words a reader would be typing into. */
    for (const match of text.matchAll(/(?:label|placeholder|hint|aria-label)\s*[=:]\s*(?:"([^"]*)"|'([^']*)'|\{'([^']*)'\}|\{"([^"]*)"\})/g)) {
      const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
      if (/private key|secret key|seed phrase|recovery phrase|mnemonic/i.test(value)) {
        offenders.push(`${relative(ROOT, file)}: ${value}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `these would ask somebody for a key:\n  ${offenders.join('\n  ')}`);
});

test('campaign qualification is its own checklist and says what being hireable does not cover', () => {
  assert.ok(BUILD_QUALIFICATION.length >= 5);
  for (const item of BUILD_QUALIFICATION) {
    assert.ok(item.requirement.length > 10, item.id);
    assert.ok(item.note.length > 20, item.id);
    assert.ok(['pokter-verifies', 'builder-declares', 'bnb-decides'].includes(item.visibility), item.id);
  }
  assert.ok(EXECUTION_ONLY_REQUIREMENTS.length > 0, 'the execution bar a reporting agent cannot meet must be named');
  assert.match(CAMPAIGN_IS_SEPARATE, /different things/i);
  assert.match(CAMPAIGN_IS_SEPARATE, /counts for neither|fund yourself|funded yourself/i);
});

/*
 * The warning the campaign copy has to carry: a read-only reporting agent
 * is a legitimate, hireable product, and telling such a builder to add
 * trading so they can enter a campaign would be Pokter selling a risk it
 * does not carry.
 */
test('the campaign checklist states that a reporting agent can be hireable without it', () => {
  const readOnlyBlocked = BUILD_QUALIFICATION.filter((item) => !item.reachableByReadOnlyAgent);
  assert.ok(readOnlyBlocked.length >= 1);
  for (const item of readOnlyBlocked) {
    assert.ok(/on-chain|onchain|category/i.test(item.requirement), item.id);
  }
});
