import assert from 'node:assert/strict';
import test from 'node:test';
import { stringToHex } from 'viem';

import { blockAtTime, deliverableUrlFrom, findDeliverableUrl } from '../src/lib/erc8183/deliverable-url';

// Blocks every 0.5 s from t=1,000,000: block n has timestamp 1,000,000 + n/2.
const chain = (head: bigint) => {
  let reads = 0;
  const reader = {
    reads: () => reads,
    getBlock: async (args?: { blockNumber?: bigint }) => {
      reads += 1;
      const n = args?.blockNumber ?? head;
      return { number: n, timestamp: 1_000_000n + n / 2n } as never;
    },
    getLogs: async (args: { fromBlock: bigint; toBlock: bigint }) => {
      const submitted = 90_000_000n;
      return (submitted >= args.fromBlock && submitted <= args.toBlock ? [{ args: { optParams: stringToHex('{"deliverable_url":"https://agent.example/job/1490"}') } }] : []) as never;
    },
  };
  // A stand-in for viem's client: only the two reads the finder uses.
  return reader as typeof reader & Parameters<typeof findDeliverableUrl>[0];
};

test('the submit block is found by timestamp in a few header reads', async () => {
  const c = chain(128_000_000n);
  const at = await blockAtTime(c, 1_000_000n + 45_000_000n);
  // Within a couple of seconds' worth of blocks, in a handful of reads.
  assert.ok(at >= 89_999_996n && at <= 90_000_004n, String(at));
  assert.ok(c.reads() <= 5, `${c.reads()} reads`);
});

test('the URL comes from the event around that block', async () => {
  const c = chain(128_000_000n);
  assert.equal(await findDeliverableUrl(c, '0x0000000000000000000000000000000000000001', 1490n, 1_000_000n + 45_000_000n), 'https://agent.example/job/1490');
});

test('a job never submitted has no URL, and odd payloads are tolerated', async () => {
  assert.equal(await findDeliverableUrl(chain(10n), '0x0000000000000000000000000000000000000001', 1n, 0n), undefined);
  assert.equal(deliverableUrlFrom('0x'), undefined);
  assert.equal(deliverableUrlFrom(stringToHex('not json')), undefined);
  assert.equal(deliverableUrlFrom(stringToHex('{"deliverable_url":"https://x"}\0\0')), 'https://x');
});
