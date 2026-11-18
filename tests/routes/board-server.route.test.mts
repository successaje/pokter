import assert from 'node:assert/strict';
import test from 'node:test';

import { ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult, getAddress, type Address } from 'viem';

import { BOARD_ABI } from '../../src/lib/board/contract';
import type { VerifiedReview } from '../../src/lib/reviews/model';

/*
 * The server's reads of the board and the Agent ID registry, through a
 * reader the test supplies: whether a wallet holds an Agent ID, and whether
 * the board would accept a review, in the board's own words.
 */

const { boardContract, holdsAgentId, simulateBoardReview } = await import('../../src/lib/board/server');

const BOARD: Address = getAddress('0x00000000000000000000000000000000000b0a2d');
const review: VerifiedReview = {
  chainId: 56, jobId: '57067', agentChainId: 56, agentTokenId: '1220',
  buyer: '0x7751bE7B2BA4141D5E32Ef14e9E5cc73e9D7bf0C', rating: 5, deliveredAsPromised: true,
  speed: 'early', wouldHireAgain: true, comment: '', signature: '0x01', updatedAt: '2026-11-18T12:00:00.000Z',
};

test('no board is offered until its address is set, and a bad address is no board', () => {
  delete process.env.POKTER_BOARD_ADDRESS;
  assert.equal(boardContract(), null);
  process.env.POKTER_BOARD_ADDRESS = 'not-an-address';
  assert.equal(boardContract(), null);
  process.env.POKTER_BOARD_ADDRESS = BOARD.toLowerCase();
  process.env.POKTER_BOARD_FROM_BLOCK = '68000000';
  assert.deepEqual(boardContract(), { address: BOARD, fromBlock: 68_000_000n });
  delete process.env.POKTER_BOARD_FROM_BLOCK;
  assert.deepEqual(boardContract(), { address: BOARD, fromBlock: null });
  delete process.env.POKTER_BOARD_ADDRESS;
});

test('a holder is remembered for a day, a non-holder for ten minutes', async () => {
  const balances = new Map<string, bigint>([['0x00000000000000000000000000000000000000a1', 1n]]);
  let reads = 0;
  const reader = {
    readContract: (async ({ args }: { args: [Address] }) => {
      reads += 1;
      return balances.get(args[0].toLowerCase()) ?? 0n;
    }) as never,
  };
  const holder: Address = '0x00000000000000000000000000000000000000A1';
  const other: Address = '0x00000000000000000000000000000000000000a2';
  const t = Date.parse('2026-11-18T12:00:00Z');

  assert.equal(await holdsAgentId(holder, reader, t), true);
  assert.equal(await holdsAgentId(other, reader, t), false);
  assert.equal(reads, 2);
  assert.equal(await holdsAgentId(holder, reader, t + 23 * 3_600_000), true);
  assert.equal(await holdsAgentId(other, reader, t + 9 * 60_000), false);
  assert.equal(reads, 2, 'both answers came from memory');

  balances.set(other.toLowerCase(), 1n);
  assert.equal(await holdsAgentId(other, reader, t + 11 * 60_000), true, 'a wallet that claims one is seen within minutes');
  assert.equal(reads, 3);
});

function refusing(errorName: string) {
  return {
    simulateContract: (async () => {
      const data = encodeErrorResult({ abi: BOARD_ABI, errorName: errorName as never });
      const reverted = new ContractFunctionRevertedError({ abi: BOARD_ABI, data, functionName: 'review' });
      throw new ContractFunctionExecutionError(reverted, { abi: BOARD_ABI, functionName: 'review', args: [], contractAddress: BOARD });
    }) as never,
  };
}

test('the board’s acceptance is the simulated call’s', async () => {
  const accepting = { simulateContract: (async () => ({ result: undefined })) as never };
  assert.deepEqual(await simulateBoardReview(review, BOARD, accepting), { ok: true });
});

test('a refusal comes back in the board’s own terms', async () => {
  assert.deepEqual(await simulateBoardReview(review, BOARD, refusing('NothingDelivered')), {
    ok: false,
    reason: 'The agent delivered nothing on this job, so it cannot be reviewed.',
  });
  assert.deepEqual(await simulateBoardReview(review, BOARD, refusing('AlreadyReviewed')), {
    ok: false,
    reason: 'This job is already reviewed on PokterBoard.',
  });
});

test('a failed read is an error, never a refusal', async () => {
  const down = { simulateContract: (async () => { throw new Error('fetch failed'); }) as never };
  await assert.rejects(simulateBoardReview(review, BOARD, down), /fetch failed/);
});
