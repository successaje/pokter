/**
 * Read-only, bounded comparison of public Pokter receipts with ERC-8183
 * JobFunded events. It never writes to the site, database, or chain.
 *
 * Run: npx tsx scripts/audit-proof-coverage.mts --blocks=20000
 * Or: npx tsx scripts/audit-proof-coverage.mts --mode=ids --mainnet-id-from=57000
 *      --mainnet-id-to=57100 --testnet-id-from=1600 --testnet-id-to=1700
 * Both modes report their exact coverage. ID mode is useful where public RPCs
 * refuse historical eth_getLogs even for one block.
 * A missing shared-escrow job is not automatically a missing Pokter hire:
 * only a matching on-chain Pokter envelope is an independently visible lead.
 */
import { createPublicClient, getAddress, http, parseAbi, parseAbiItem, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { decodePokterJobEnvelope, decodeReferenceJobDescription } from '@/lib/erc8183/job-envelope';

const RECEIPTS_URL = process.env.AUDIT_BASE_URL ?? 'https://pokter.xyz';
const CHUNK = 2_000n;
const MAX_BLOCKS = 100_000n;
const MAX_IDS = 300n;
const mode = process.argv.includes('--mode=ids') ? 'ids' : 'logs';
const FUNDED = parseAbiItem('event JobFunded(uint256 indexed jobId, address indexed client, address indexed provider, uint256 amount)');
const JOB_ABI = parseAbi(['function getJob(uint256) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable))']);

type Receipt = { chainId: number; jobId: string; escrow: string };
type AuditFinding = { jobId: string; kind: 'pokter-marker' | 'reference-format-unverifiable' | 'other-escrow-job' | 'unreadable' };

function option(name: string): bigint | null {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  if (raw === undefined) return null;
  if (!/^\d+$/.test(raw)) throw new Error(`--${name} must be a non-negative integer`);
  return BigInt(raw);
}

const windowBlocks = option('blocks') ?? 20_000n;
if (windowBlocks < 1n || windowBlocks > MAX_BLOCKS) throw new Error(`--blocks must be between 1 and ${MAX_BLOCKS}`);

const response = await fetch(new URL('/api/v1/receipts', RECEIPTS_URL), { signal: AbortSignal.timeout(20_000) });
if (!response.ok) throw new Error(`Receipts API returned HTTP ${response.status}`);
const index: { receipts?: Receipt[] } = await response.json();
if (!Array.isArray(index.receipts)) throw new Error('Receipts API did not return a receipts array');

const report = [];
for (const { chainId, label, rpc, chain } of [
  { chainId: 56, label: 'BNB Mainnet', rpc: process.env.AUDIT_MAINNET_RPC ?? 'https://bsc-rpc.publicnode.com', chain: bsc },
  { chainId: 97, label: 'BNB Testnet', rpc: process.env.AUDIT_TESTNET_RPC ?? 'https://bsc-testnet-rpc.publicnode.com', chain: bscTestnet },
] as const) {
  const client = createPublicClient({ chain, transport: http(rpc, { timeout: 20_000, retryCount: 1 }) });
  const chainReceipts = index.receipts.filter((receipt) => receipt.chainId === chainId);
  const escrows = new Set(chainReceipts.map((receipt) => getAddress(receipt.escrow)));
  if (escrows.size !== 1) throw new Error(`${label}: expected one escrow in the published receipts; found ${escrows.size}`);
  const escrow = [...escrows][0];
  const indexed = new Set(chainReceipts.map((receipt) => receipt.jobId));
  const networkArg = chainId === 56 ? 'mainnet' : 'testnet';
  const head = await client.getBlockNumber();
  const fundedIds = new Set<string>();
  const failedRanges: Array<{ from: string; to: string; reason: string }> = [];
  let range: { kind: 'blocks' | 'job IDs'; from: string; to: string; inclusive: true };
  if (mode === 'logs') {
    const to = option(`${networkArg}-to`) ?? head;
    const from = option(`${networkArg}-from`) ?? (to > windowBlocks ? to - windowBlocks + 1n : 0n);
    if (to > head || from > to || to - from + 1n > MAX_BLOCKS) throw new Error(`${label}: invalid range; maximum ${MAX_BLOCKS} blocks at or below head`);
    range = { kind: 'blocks', from: from.toString(), to: to.toString(), inclusive: true };
    for (let start = from; start <= to; start += CHUNK) {
      const end = start + CHUNK - 1n < to ? start + CHUNK - 1n : to;
      try {
        const logs = await client.getLogs({ address: escrow, event: FUNDED, fromBlock: start, toBlock: end });
        for (const log of logs) if (log.args.jobId !== undefined) fundedIds.add(log.args.jobId.toString());
      } catch (error) {
        failedRanges.push({ from: start.toString(), to: end.toString(), reason: error instanceof Error ? error.message.slice(0, 180) : 'RPC error' });
      }
    }
  } else {
    const counter = await client.readContract({ address: escrow, abi: parseAbi(['function jobCounter() view returns (uint256)']), functionName: 'jobCounter' });
    const to = option(`${networkArg}-id-to`) ?? counter;
    const from = option(`${networkArg}-id-from`) ?? (to > 99n ? to - 99n : 1n);
    if (from < 1n || to > counter || from > to || to - from + 1n > MAX_IDS) throw new Error(`${label}: invalid ID range; maximum ${MAX_IDS} IDs at or below counter ${counter}`);
    range = { kind: 'job IDs', from: from.toString(), to: to.toString(), inclusive: true };
    for (let id = from; id <= to; id += 1n) {
      try {
        const job = await client.readContract({ address: escrow, abi: JOB_ABI, functionName: 'getJob', args: [id] });
        if (job.id === id && job.budget > 0n && job.status !== 0) fundedIds.add(id.toString());
      } catch (error) {
        failedRanges.push({ from: id.toString(), to: id.toString(), reason: error instanceof Error ? error.message.slice(0, 180) : 'RPC error' });
      }
    }
  }

  const findings: AuditFinding[] = [];
  for (const jobId of [...fundedIds].filter((id) => !indexed.has(id)).sort((a, b) => Number(a) - Number(b))) {
    try {
      const job = await client.readContract({ address: escrow as Address, abi: JOB_ABI, functionName: 'getJob', args: [BigInt(jobId)] });
      const marker = decodePokterJobEnvelope(job.description);
      const kind: AuditFinding['kind'] = marker && getAddress(marker.provider) === getAddress(job.provider)
        ? 'pokter-marker'
        : decodeReferenceJobDescription(job.description) ? 'reference-format-unverifiable' : 'other-escrow-job';
      findings.push({ jobId, kind });
    } catch {
      findings.push({ jobId, kind: 'unreadable' });
    }
  }

  report.push({
    network: label,
    chainId,
    escrow,
    head: head.toString(),
    scannedRange: range,
    indexedReceiptsAcrossAllTime: indexed.size,
    fundedJobsObservedInRange: fundedIds.size,
    fundedJobsAlreadyIndexed: [...fundedIds].filter((id) => indexed.has(id)).length,
    sharedEscrowFundedJobsNotIndexedByPokter: findings.length,
    notIndexedByAttribution: {
      pokterMarker: findings.filter((finding) => finding.kind === 'pokter-marker').map((finding) => finding.jobId),
      referenceFormatUnverifiable: findings.filter((finding) => finding.kind === 'reference-format-unverifiable').map((finding) => finding.jobId),
      otherEscrowJobs: findings.filter((finding) => finding.kind === 'other-escrow-job').length,
      unreadable: findings.filter((finding) => finding.kind === 'unreadable').map((finding) => finding.jobId),
    },
    failedRanges,
    allRpcReadsSucceeded: failedRanges.length === 0 && !findings.some((finding) => finding.kind === 'unreadable'),
  });
}

console.log(JSON.stringify({ observedAt: new Date().toISOString(), receiptsSource: new URL('/api/v1/receipts', RECEIPTS_URL).toString(), mode, scope: 'Funded jobs in the stated range on the shared escrow; reference-format jobs cannot be attributed without Pokter private quote intents. This is not an all-history completeness claim.', networks: report }, null, 2));
if (report.some((chain) => !chain.allRpcReadsSucceeded || chain.notIndexedByAttribution.pokterMarker.length)) process.exitCode = 1;
