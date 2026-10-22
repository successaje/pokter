/**
 * Capture a real Venus Core Pool position as a test fixture.
 *
 * `tests/venus-report-check.test.mts` checks delivered health-factor
 * reports against figures read from BNB Chain, and those figures have to be
 * real or the test proves nothing about the calculation. They also cannot
 * be re-read later: every free BNB Chain endpoint prunes state within about
 * a hundred blocks, so a fixture is a one-time capture at a block that will
 * shortly stop being readable. This script is how one is taken, and the
 * fixture records the account, the block and the endpoint so a reader can
 * see where the numbers came from even though they can no longer fetch them
 * again.
 *
 * It also captures the node's own refusal for a block outside the retained
 * window, so the "could not verify" path is tested against the words a real
 * node uses rather than a guess at them.
 *
 * Read-only. Three view calls and two block headers; no key, no signer, no
 * transaction.
 *
 *   BSC_MAINNET_RPC_URL=https://bsc-dataseed.bnbchain.org \
 *     npx tsx scripts/capture-venus-fixture.mts 0x… [blocksBehindHead]
 */
import { writeFileSync } from 'node:fs';
import { getAddress, type Address } from 'viem';

import { readVenusPosition, venusClient } from '@/lib/assay/venus';

const [rawAccount, rawBehind] = process.argv.slice(2);
if (!rawAccount) throw new Error('Usage: capture-venus-fixture.mts <account> [blocksBehindHead]');
const account = getAddress(rawAccount) as Address;
// Far enough behind the head that every node in a load balancer has it,
// near enough that a pruning node still keeps its state.
const behind = BigInt(rawBehind ?? '20');

const client = venusClient();
const head = await client.getBlockNumber();
const block = head - behind;
const reading = await readVenusPosition(client, account, { atBlock: block });
const header = await client.getBlock({ blockNumber: block });

// What the node says about state it no longer keeps, in its own words.
const prunedError = await readVenusPosition(client, account, { atBlock: head - 2_000_000n }).then(
  () => null,
  (error: Error) => error.message.replace(/\s+/g, ' ').trim(),
);

const fixture = {
  note: `Venus Core Pool position of ${account} on BNB Smart Chain mainnet, read at block ${block} on ${new Date().toISOString()} from ${process.env.BSC_MAINNET_RPC_URL ?? 'the default public node'}. State at this block is no longer served by free endpoints, so these figures cannot be re-fetched; they were captured by scripts/capture-venus-fixture.mts.`,
  chainId: 56,
  account: reading.account,
  block: block.toString(),
  blockTime: new Date(Number(header.timestamp) * 1000).toISOString(),
  healthFactor: reading.healthFactor,
  borrowLimitRatio: reading.borrowLimitRatio,
  liquidatable: reading.liquidatable,
  debtUsd: reading.borrowUsd,
  collateralUsd: Object.values(reading.rows.collateral).reduce((sum, leg) => sum + leg.amount, 0),
  rows: reading.rows,
  prunedError,
};

const path = `tests/fixtures/venus-health-${account.toLowerCase().slice(0, 10)}.json`;
writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${path}`);
console.log(JSON.stringify({ ...fixture, rows: undefined, note: undefined }, null, 2));
