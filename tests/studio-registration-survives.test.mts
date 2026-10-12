import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * What the create flow restores after a remount.
 *
 * `useAgentDraft` is a client hook with no DOM here, so the restore rule
 * is mirrored. It is worth pinning because the failure it prevents is
 * expensive and silent: an identity minted on chain, the draft deleted on
 * success, and a blank form where the confirmation should be — which on
 * mainnet invites paying to mint a second one.
 */
const PUBLISHED = 'pokter-agent-registration-published-v1';
const RECOVERY = 'pokter-agent-registration-recovery-v1';

type Store = Record<string, string>;
const restore = (store: Store, draftId: string) => {
  const saved = store[`${PUBLISHED}:${draftId}`];
  if (saved) return JSON.parse(saved);
  const r = store[`${RECOVERY}:${draftId}`];
  const rec = r ? JSON.parse(r) : null;
  return rec?.agentId
    ? { chainId: rec.chainId, tokenId: String(rec.agentId), name: '' }
    : null;
};

test('a completed registration is still shown after a remount', () => {
  const store: Store = {
    [`${PUBLISHED}:d1`]: JSON.stringify({ chainId: 97, tokenId: '2599', name: 'Pokter Evidence' }),
  };
  assert.deepEqual(restore(store, 'd1'), { chainId: 97, tokenId: '2599', name: 'Pokter Evidence' });
});

test('a mint that landed is treated as published even without the saved record', () => {
  // The tab died between the mint and the success write; the agent exists.
  const store: Store = {
    [`${RECOVERY}:d1`]: JSON.stringify({ chainId: 97, registrationHash: '0xabc', agentId: 2599 }),
  };
  assert.deepEqual(
    restore(store, 'd1'),
    { chainId: 97, tokenId: '2599', name: '' },
    'without this the owner is invited to mint a second identity',
  );
});

test('a half-finished mint with no id is not reported as success', () => {
  const store: Store = {
    [`${RECOVERY}:d1`]: JSON.stringify({ chainId: 97, registrationHash: '0xabc' }),
  };
  assert.equal(restore(store, 'd1'), null, 'the transaction may still revert');
});

test('one draft never shows another draft’s registration', () => {
  const store: Store = {
    [`${PUBLISHED}:d1`]: JSON.stringify({ chainId: 97, tokenId: '2599', name: 'A' }),
  };
  assert.equal(restore(store, 'd2'), null);
});

test('an empty store shows no registration', () => {
  assert.equal(restore({}, 'd1'), null);
});
