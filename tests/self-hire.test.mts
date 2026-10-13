import assert from 'node:assert/strict';
import test from 'node:test';

/*
 * Funding a job your own wallet would have to deliver.
 *
 * The escrow refuses the submission: `submit` reverts 0x15e5dd74 from
 * the rightful provider on a funded, in-date job where the buyer and the
 * seller are the same wallet, while the same call on a job with distinct
 * parties goes through. Mainnet jobs 56981 and 56985 were funded that
 * way and can never be completed by anyone, including by hand.
 *
 * Pokter knew both addresses before taking the money. This pins the
 * comparison it now makes, including the casing, because an address from
 * a wallet and an address from a registry rarely agree on it.
 */
const isSelfHire = (wallet: string | null, provider: string | null) =>
  Boolean(wallet && provider && wallet.toLowerCase() === provider.toLowerCase());

const OWNER = '0x93847647d7eb72a69E162117df6a8697dF53EDda';

test('the agent’s own wallet is refused as its buyer', () => {
  assert.equal(isSelfHire(OWNER, OWNER), true);
});

test('casing never decides it', () => {
  assert.equal(isSelfHire(OWNER.toLowerCase(), OWNER.toUpperCase().replace('0X', '0x')), true);
  assert.equal(isSelfHire(OWNER.toUpperCase().replace('0X', '0x'), OWNER), true);
});

test('an ordinary buyer is unaffected', () => {
  assert.equal(isSelfHire('0x5aAF7b5B2170986C59279682Bd714c475ae8C718', OWNER), false);
});

test('an unknown address blocks nobody', () => {
  /* Before a wallet connects there is nothing to compare, and the hire
     must not be refused on a missing value. */
  assert.equal(isSelfHire(null, OWNER), false);
  assert.equal(isSelfHire(OWNER, null), false);
  assert.equal(isSelfHire('', ''), false);
});
