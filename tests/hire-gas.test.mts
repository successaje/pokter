import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { failedOnChain, gasLimitFor } from '../src/lib/wallet/gas';
import { walletActionError } from '../src/lib/wallet/errors';

/*
 * Testnet transaction 0x60758a67…7da2, 27 October 2026: a wallet sent
 * createJob with a 900,000 gas limit, it used 886,648 and failed; the same
 * call 38 seconds later used 948,798 and created job 1673.
 */
const ACCOUNT = '0xf5506b65e71601991895cd40bd2e875f29cca0da';
const ESCROW = '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE';

test('Pokter sets the gas limit from the network’s estimate, with 30% headroom', async () => {
  const seen: unknown[] = [];
  const read = { estimateGas: async (request: unknown) => { seen.push(request); return 948_798n; } };
  const limit = await gasLimitFor(read, { account: ACCOUNT, to: ESCROW, data: '0x41528812', value: 0n });
  assert.deepEqual(limit, { gas: 1_233_438n }, 'rounded up, and well above the 900,000 that failed');
  assert.deepEqual(seen, [{ account: ACCOUNT, to: ESCROW, data: '0x41528812', value: 0n }], 'the exact call is estimated');
  /* A call that cannot be estimated would fail now: the wallet's own check says why. */
  assert.deepEqual(await gasLimitFor({ estimateGas: async () => { throw new Error('execution reverted'); } }, { account: ACCOUNT, to: ESCROW, data: '0x' }), {});
});

test('a failed step says whether it ran out of gas or was refused', () => {
  assert.equal(failedOnChain('creating', 886_648n, 900_000n), 'CREATING_OUT_OF_GAS', 'the 27 October failure');
  assert.equal(failedOnChain('funding', 900_000n, 900_000n), 'FUNDING_OUT_OF_GAS');
  assert.equal(failedOnChain('funding', 120_000n, 900_000n), 'FUNDING_REVERTED', 'stopped short: refused');
  assert.equal(failedOnChain('creating', 886_648n, null), 'CREATING_REVERTED', 'with no limit read, never a guessed cause');
});

test('the buyer reads which transaction failed, how, and that only its fee was spent', () => {
  const gas = walletActionError(new Error('CREATING_OUT_OF_GAS'), 'Commissioning');
  assert.equal(gas, 'Commissioning stopped: the transaction that creates the job ran out of gas, so the network undid it. That transaction changed nothing, and only its network fee was spent. Try again.');
  const refused = walletActionError(new Error('FUNDING_REVERTED'), 'Commissioning');
  assert.match(refused, /^Commissioning stopped: the contract refused the transaction that funds the escrow, so the network undid it\./);
  for (const message of [gas, refused]) assert.doesNotMatch(message, /gave no reason|Check the selected network/);
  /* A code no step owns still reads as before, and the swap keeps its own words. */
  assert.match(walletActionError(new Error('WHATEVER_REVERTED'), 'Commissioning'), /gave no reason we can translate/);
  assert.match(walletActionError(new Error('SWAP_REVERTED'), 'Funding'), /the swap failed on chain/);
});

test('every transaction the external wallet sends carries Pokter’s limit', () => {
  const external = readFileSync(new URL('../src/lib/wallet/external.ts', import.meta.url), 'utf8');
  const sends = external.match(/wallet\.sendTransaction\(/g)?.length ?? 0;
  assert.ok(sends >= 7);
  assert.equal(external.match(/gasLimitFor\(read, /g)?.length, sends, 'one estimate per send');
  assert.doesNotMatch(external, /`\$\{step\.toUpperCase\(\)\}_REVERTED`/, 'a failed step is classified, not assumed refused');
  assert.equal(external.match(/throw new Error\(await failureOf\(read, step, (?:receipt|confirmed\.value)\.transactionHash, (?:receipt|confirmed\.value)\.gasUsed\)\)/g)?.length, 2, 'both hire paths');
});
