import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareQuoteRequest } from '../src/lib/hire/prepare-quote';

/*
 * prepare_hire asks the agent for its price in the money the owner
 * authorised, as the hire page does. On 26 November it asked with no
 * currency at all, so Touchstone signed in $U and a USDT hire from an
 * assistant was refused as "signed a price in $U".
 */

const USDT = '0x55d398326f99059fF775485246999027B3197955';
const base = { chainId: 56, tokenId: '374115', task: 'Check a token', category: 'token-safety', escrowChainId: 56 };

test('a hire the owner authorised in USDT asks the agent for USDT, on the owner’s escrow', () => {
  const sent = prepareQuoteRequest({ ...base, ownerToken: USDT });
  assert.equal(sent.preferredToken, USDT);
  assert.equal(sent.escrowChainId, 56);
  assert.deepEqual({ chainId: sent.chainId, tokenId: sent.tokenId, task: sent.task, category: sent.category }, { chainId: 56, tokenId: '374115', task: 'Check a token', category: 'token-safety' });
});

test('a hire in $U asks for nothing: it is every agent’s default', () => {
  const sent = prepareQuoteRequest({ ...base, ownerToken: null });
  assert.equal('preferredToken' in sent, false);
  assert.equal('escrowChainId' in sent, false);
});

test('the preference follows the escrow the owner chose, not the agent’s registration', () => {
  assert.equal(prepareQuoteRequest({ ...base, chainId: 97, escrowChainId: 56, ownerToken: USDT }).escrowChainId, 56);
});
