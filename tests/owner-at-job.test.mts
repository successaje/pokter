import assert from 'node:assert/strict';
import test from 'node:test';

import { fundedRecently, OWNER_WINDOW_MS, ownerAtFunding, ownerCandidate, type OwnershipReader } from '../src/lib/erc8183/owner-at-job';

const now = Date.parse('2026-10-20T12:00:00Z');
const job = { status: 'FUNDED', hireTxHash: '0xabc', hiredAt: new Date(now - 5 * 60_000).toISOString() };

test('a job funded minutes ago, with its funding transaction, is checked', () => {
  assert.equal(ownerCandidate(job, false, now), true);
});

test('an owner is recorded once and never replaced', () => {
  assert.equal(ownerCandidate(job, true, now), false);
});

test('without a funding transaction there is no proof of when it was funded', () => {
  assert.equal(ownerCandidate({ ...job, hireTxHash: null }, false, now), false);
});

test('an unfunded job has no owner to record', () => {
  assert.equal(ownerCandidate({ ...job, status: 'OPEN' }, false, now), false);
});

test('a job first seen outside the window is left unattributed', () => {
  assert.equal(ownerCandidate({ ...job, hiredAt: new Date(now - OWNER_WINDOW_MS - 1).toISOString() }, false, now), false);
});

test('a backfilled job seen today is judged by its funding block, not by when Pokter saw it', () => {
  // Backfill writes hiredAt as the day it ran; the block says the job is months old.
  const backfilled = { ...job, hiredAt: new Date(now - 60_000).toISOString() };
  assert.equal(ownerCandidate(backfilled, false, now), true);
  assert.equal(fundedRecently(Date.parse('2026-06-01T00:00:00Z'), now), false);
});

test('the funding block must fall within the window of the owner read', () => {
  assert.equal(fundedRecently(now - 30 * 60_000, now), true);
  assert.equal(fundedRecently(now - OWNER_WINDOW_MS, now), true);
  assert.equal(fundedRecently(now - OWNER_WINDOW_MS - 1, now), false);
  assert.equal(fundedRecently(now + 10 * 60_000, now), false);
  assert.equal(fundedRecently(Number.NaN, now), false);
});

/*
 * A chain of blocks 450 ms apart (BNB Chain's pace), an agent minted to
 * `builder`, and transfers at given blocks. `ownerAt` answers as the
 * registry would at that block.
 */
function chain(opts: { latest: bigint; transfers?: Array<{ block: bigint; to: string }>; failLogs?: boolean }): OwnershipReader & { queried: Array<[bigint, bigint]> } {
  const genesisMs = Date.parse('2026-10-20T00:00:00Z');
  const moves = (opts.transfers ?? []).slice().sort((a, b) => Number(a.block - b.block));
  const queried: Array<[bigint, bigint]> = [];
  return {
    queried,
    latestBlock: async () => opts.latest,
    blockTimeMs: async (b) => genesisMs + Number(b) * 450,
    ownerAt: async (b) => moves.filter((m) => m.block <= b).at(-1)?.to ?? 'builder',
    transfers: async (from, to) => {
      if (opts.failLogs) throw new Error('RPC refused the range');
      queried.push([from, to]);
      return moves.filter((m) => m.block >= from && m.block <= to).length;
    },
  };
}
const fundedAt = (block: bigint) => Date.parse('2026-10-20T00:00:00Z') + Number(block) * 450;

test('with no transfer since funding, the owner now is the owner at funding', async () => {
  assert.equal(await ownerAtFunding(chain({ latest: 10_400n }), { fundedAtMs: fundedAt(10_000n), fromBlock: 10_000n }), 'builder');
});

test('an agent sold after funding but before attribution runs is left unknown, not credited to the buyer', async () => {
  const sold = chain({ latest: 10_400n, transfers: [{ block: 10_150n, to: 'new-owner' }] });
  // Reading the owner alone would say "new-owner" — the mistake this proof exists to prevent.
  assert.equal(await sold.ownerAt(10_400n), 'new-owner');
  assert.equal(await ownerAtFunding(sold, { fundedAtMs: fundedAt(10_000n), fromBlock: 10_000n }), null);
});

test('a transfer in the funding block itself cannot be ordered against the funding, so it is unknown', async () => {
  const same = chain({ latest: 10_400n, transfers: [{ block: 10_000n, to: 'new-owner' }] });
  assert.equal(await ownerAtFunding(same, { fundedAtMs: fundedAt(10_000n), fromBlock: 10_000n }), null);
});

test('a transfer before the funding block does not stop the proof', async () => {
  const earlier = chain({ latest: 10_400n, transfers: [{ block: 9_000n, to: 'builder-2' }] });
  assert.equal(await ownerAtFunding(earlier, { fundedAtMs: fundedAt(10_000n), fromBlock: 10_000n }), 'builder-2');
});

test('funded on another chain, the proof starts from a registry block at or before the funding time', async () => {
  const sold = chain({ latest: 20_000n, transfers: [{ block: 15_010n, to: 'new-owner' }] });
  assert.equal(await ownerAtFunding(sold, { fundedAtMs: fundedAt(15_000n) }), null);
  const quiet = chain({ latest: 20_000n });
  assert.equal(await ownerAtFunding(quiet, { fundedAtMs: fundedAt(15_000n) }), 'builder');
  assert.ok(quiet.queried[0][0] <= 15_000n, 'the searched range starts at or before the funding');
  assert.equal(quiet.queried.at(-1)![1], 20_000n, 'and runs to the block the owner was read at');
});

test('a range the RPC will not answer throws, so the job is tried again rather than guessed', async () => {
  await assert.rejects(ownerAtFunding(chain({ latest: 10_400n, failLogs: true }), { fundedAtMs: fundedAt(10_000n), fromBlock: 10_000n }));
});

test('a funding too long ago to check cheaply is unknown', async () => {
  assert.equal(await ownerAtFunding(chain({ latest: 200_000n }), { fundedAtMs: fundedAt(10_000n), fromBlock: 10_000n }), null);
});
