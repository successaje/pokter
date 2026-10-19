/**
 * Recover the transaction that moved each job to its current state.
 *
 * The index records a job's state by reading the chain, so a job that settled
 * from a buyer's own wallet is stored as COMPLETED with no hash: nothing here
 * sent that transaction and nothing went looking for it afterwards. The work
 * tab and the proof page then fall back to "read it in the escrow", which is
 * honest but weaker than a receipt. This fills in what can be found.
 *
 * It needs an archive node, which is the whole difficulty. The escrow's logs
 * are the only index from a job id to the transactions that touched it, and
 * no free BNB endpoint serves them: the data-seed nodes refuse `eth_getLogs`
 * outright, publicnode has pruned the receipts (it returns the transaction
 * but not its logs), and Etherscan V2 answers "Free API access is not
 * supported for this chain" for 56 and 97 alike. So the endpoint is a
 * parameter. Set BACKFILL_RPC_56 / BACKFILL_RPC_97 to an archive URL.
 *
 * It classifies without an ABI, because the deployment is unverified on both
 * Sourcify and BscScan. A job's logs carry its id in the first indexed topic,
 * which identifies the job but not the act; the act is read from the function
 * selector of the transaction that emitted them. Those selectors are computed
 * from the SDK's own ABI, so they cannot drift from what the app calls, and
 * the mapping was checked against a known funding transaction before this was
 * written.
 *
 * Dry by default. Pass --write to store anything.
 */
import { DatabaseSync } from 'node:sqlite';
import { toFunctionSelector } from 'viem';

const WRITE = process.argv.includes('--write');
const CHUNK = Number(process.env.BACKFILL_CHUNK ?? 5000);

/* Selector to the column it settles. `dispute` and `claimRefund` take only a
   job id; `settle` and `submit` carry evidence with it. */
const ACTS = [
  { sig: 'settle(uint256,bytes)', column: 'settle_tx_hash' },
  { sig: 'dispute(uint256)', column: 'dispute_tx_hash' },
  { sig: 'claimRefund(uint256)', column: 'reclaim_tx_hash' },
] as const;
const BY_SELECTOR = new Map(ACTS.map((a) => [toFunctionSelector(a.sig), a.column]));

const COMMERCE: Record<number, string> = {
  56: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6',
  97: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE',
};

function rpcFor(chainId: number): string | null {
  return process.env[`BACKFILL_RPC_${chainId}`] ?? null;
}

async function call<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'rpc error'}`);
  return body.result as T;
}

type Log = { transactionHash: string; blockNumber: string };

/** Every log the escrow emitted for one job id, walked in chunks. */
async function logsForJob(url: string, commerce: string, jobId: string, from: number, to: number): Promise<Log[]> {
  const topic = `0x${BigInt(jobId).toString(16).padStart(64, '0')}`;
  const out: Log[] = [];
  for (let start = from; start <= to; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, to);
    const page = await call<Log[]>(url, 'eth_getLogs', [
      { address: commerce, topics: [null, topic], fromBlock: `0x${start.toString(16)}`, toBlock: `0x${end.toString(16)}` },
    ]);
    out.push(...page);
  }
  return out;
}

async function main() {
  const db = new DatabaseSync('data/jobs.db');
  const pending = db
    .prepare(
      `select job_id, chain_id, status, hire_tx_hash
         from jobs
        where (status = 'COMPLETED' and settle_tx_hash is null)
           or (status = 'REJECTED'  and dispute_tx_hash is null)
           or (status = 'EXPIRED'   and reclaim_tx_hash is null)
        order by hired_at desc`,
    )
    .all() as Array<{ job_id: string; chain_id: number; status: string; hire_tx_hash: string | null }>;

  console.log(`${pending.length} job(s) recorded in a final state with no transaction for it.`);
  const byChain = new Map<number, typeof pending>();
  for (const job of pending) byChain.set(job.chain_id, [...(byChain.get(job.chain_id) ?? []), job]);

  let found = 0;
  let unreachable = 0;
  for (const [chainId, jobs] of byChain) {
    const url = rpcFor(chainId);
    if (!url) {
      console.log(`chain ${chainId}: ${jobs.length} job(s) skipped — set BACKFILL_RPC_${chainId} to an archive node.`);
      unreachable += jobs.length;
      continue;
    }
    const head = Number(await call<string>(url, 'eth_blockNumber', []));
    for (const job of jobs) {
      /* The funding transaction bounds the search below: nothing can settle a
         job before it was funded. Without one there is no floor to start from
         and scanning the chain for a single id is not worth the calls. */
      if (!job.hire_tx_hash) {
        console.log(`  #${job.job_id} (${job.status}) — no funding hash, so no block to search from.`);
        continue;
      }
      const receipt = await call<{ blockNumber: string } | null>(url, 'eth_getTransactionReceipt', [job.hire_tx_hash]);
      if (!receipt) {
        console.log(`  #${job.job_id} — the node does not have its funding receipt; it is not an archive node.`);
        continue;
      }
      const logs = await logsForJob(url, COMMERCE[chainId], job.job_id, Number(receipt.blockNumber), head);
      const seen = new Set<string>();
      for (const log of logs) {
        if (seen.has(log.transactionHash)) continue;
        seen.add(log.transactionHash);
        const tx = await call<{ input: string }>(url, 'eth_getTransactionByHash', [log.transactionHash]);
        const column = BY_SELECTOR.get(tx.input.slice(0, 10) as `0x${string}`);
        if (!column) continue;
        console.log(`  #${job.job_id} ${job.status} → ${column} = ${log.transactionHash}`);
        found += 1;
        if (WRITE) db.prepare(`update jobs set ${column} = ? where job_id = ? and chain_id = ?`).run(log.transactionHash, job.job_id, chainId);
      }
    }
  }

  console.log(`\n${found} transaction(s) ${WRITE ? 'written' : 'found (dry run; pass --write to store)'}.`);
  if (unreachable) console.log(`${unreachable} job(s) still unresolved for want of an archive endpoint.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
