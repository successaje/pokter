import { hexToString, parseAbiItem, type PublicClient } from 'viem';

/**
 * Find a submitted job's deliverable URL near the block it was submitted in.
 *
 * The SDK's `getErc8183DeliverableUrl` scans back from today in fixed
 * windows, so a job delivered a few days ago costs hundreds of log reads
 * and then falls out of reach (129 s, and nothing, for job 1490 on
 * testnet). The job already records `submittedAt`, so the submit block can
 * be estimated from block timestamps in a few header reads, and the event
 * read from a narrow range around it: well under the
 * 3,000-block log range public RPCs will serve.
 */
const JOB_INITIALISED = parseAbiItem('event JobInitialised(uint256 indexed jobId, bytes32 deliverable, uint64 submittedAt, bytes optParams)');
const SPAN = 1_000n;

type Reader = Pick<PublicClient, 'getBlock' | 'getLogs'>;

/**
 * The block at a timestamp, to within a second or two.
 *
 * Estimated from the recent block rate, then corrected by the gap it
 * lands at: BNB Chain's block time is steady over days, so this usually
 * settles in two or three header reads, where a binary search over the
 * whole chain took 27. Falls back to that search if it does not settle.
 */
export async function blockAtTime(client: Pick<PublicClient, 'getBlock'>, timestamp: bigint): Promise<bigint> {
  const head = await client.getBlock();
  if (timestamp >= head.timestamp) return head.number;
  const back = head.number > 200_000n ? 200_000n : head.number;
  const sample = await client.getBlock({ blockNumber: head.number - back });
  const secondsPerBlock = Number(head.timestamp - sample.timestamp) / Number(back) || 0.45;
  let guess = head.number - BigInt(Math.round(Number(head.timestamp - timestamp) / secondsPerBlock));
  for (let i = 0; i < 6; i += 1) {
    if (guess < 0n) guess = 0n;
    const block = await client.getBlock({ blockNumber: guess });
    const gap = Number(timestamp - block.timestamp);
    if (Math.abs(gap) <= 2) return guess;
    guess += BigInt(Math.round(gap / secondsPerBlock));
  }
  let lo = 0n;
  let hi = head.number;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const block = await client.getBlock({ blockNumber: mid });
    if (block.timestamp < timestamp) lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}

export function deliverableUrlFrom(optParams: `0x${string}` | undefined): string | undefined {
  if (!optParams || optParams === '0x') return undefined;
  try {
    const parsed = JSON.parse(hexToString(optParams).replace(/\0+$/, '')) as { deliverable_url?: unknown };
    return typeof parsed.deliverable_url === 'string' ? parsed.deliverable_url : undefined;
  } catch {
    return undefined;
  }
}

export async function findDeliverableUrl(client: Reader, policy: `0x${string}`, jobId: bigint, submittedAt: bigint): Promise<string | undefined> {
  if (submittedAt === 0n) return undefined;
  const block = await blockAtTime(client, submittedAt);
  const fromBlock = block > SPAN ? block - SPAN : 0n;
  const logs = await client.getLogs({ address: policy, event: JOB_INITIALISED, args: { jobId }, fromBlock, toBlock: block + SPAN });
  return deliverableUrlFrom(logs[0]?.args.optParams);
}

/**
 * A job's deliverable URL for the index: the stored one if there is one,
 * since a submission's URL never changes, otherwise a lookup, and only for
 * a job that has been delivered. The reconcile pass runs this for every job
 * in its batch, every run, so the lookup must not run when it cannot help.
 */
export async function deliverableUrlForIndex(input: { stored: string | null | undefined; status: string; lookup: () => Promise<string | undefined> }): Promise<string | undefined> {
  if (input.stored) return input.stored;
  if (input.status !== 'SUBMITTED' && input.status !== 'COMPLETED') return undefined;
  return input.lookup().catch(() => undefined);
}

