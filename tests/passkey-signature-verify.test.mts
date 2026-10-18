import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { looksLikeEoaSignature } from '../src/lib/wallet/signed-by';

/*
 * A passkey wallet is a smart account: it validates its own signatures
 * through ERC-1271, and nothing recovers an address from one. viem says so
 * in its own source for the bare helper — "Only supports Externally Owned
 * Accounts. Does not support Contract Accounts."
 *
 * Both of these routes used that helper, so a passkey buyer could be told
 * their own signature was invalid. These pin the two halves of the fix as
 * source facts, because the behaviour itself needs a funded job and a real
 * passkey to exercise end to end.
 */
const route = (p: string) => readFileSync(new URL(`../src/app/api/${p}/route.ts`, import.meta.url), 'utf8');
/* Comments stripped: these assert what the code does, and the comments
   quote the old copy on purpose so nobody reinstates it. */
const form = (p: string) =>
  readFileSync(new URL(`../src/features/workspace/${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

for (const name of ['feedback', 'reviews']) {
  test(`/api/${name} asks the account, not just the curve`, () => {
    const src = route(name);
    assert.match(src, /signedByWallet\(/, 'must verify through the ERC-1271 fallback');
    assert.doesNotMatch(
      src,
      /await verifyMessage\(\{/,
      'the bare EOA-only verifier would reject every smart-account signature',
    );
  });

  test(`/api/${name} says so when a wallet has no code yet`, () => {
    // A counterfactual account cannot prove anything; "invalid signature"
    // would send somebody hunting for a wallet they do not have.
    assert.match(route(name), /walletCanBeChecked\(/);
  });
}

for (const [file, what] of [['UsefulnessQuestion.tsx', 'feedback'], ['ReviewForm.tsx', 'review']] as const) {
  test(`the ${what} form signs with the passkey instead of refusing it`, () => {
    const src = form(file);
    assert.match(src, /signPasskeyMessage\(/, 'a passkey has no wagmi connector to sign through');
    assert.doesNotMatch(
      src,
      /cannot sign (messages|arbitrary messages) yet/,
      'the old refusal was untrue of the wallet, only of the shape asked for',
    );
  });

  test(`the ${what} form no longer requires an external wallet`, () => {
    assert.doesNotMatch(
      form(file),
      /active\.mode !== 'external' \|\| !active\.address/,
      'the guard rejected a passkey after the form was already filled in',
    );
  });
}

test('an ERC-1271 signature is not mistaken for an EOA one', () => {
  // 65 bytes is an EIP-191 signature; a contract wallet's is longer.
  assert.equal(looksLikeEoaSignature(`0x${'ab'.repeat(65)}`), true);
  assert.equal(looksLikeEoaSignature(`0x${'ab'.repeat(200)}`), false);
});
