import { explorerBaseFor } from '@/lib/network/presentation';

/** The hashes a job can carry, as much of them as a caller happens to hold. */
export interface ReceiptSource {
  chainId: number;
  status: string;
  hireTxHash?: string | null;
  settleTxHash?: string | null;
  disputeTxHash?: string | null;
  reclaimTxHash?: string | null;
}

export interface JobReceipt {
  href: string;
  /** The transaction being linked, or null when only the contract can be read. */
  hash: string | null;
}

/**
 * Where to go to check a job against the chain.
 *
 * Two things make this more than a URL template.
 *
 * The first is that the transaction worth linking depends on what the job
 * did. A settled job is evidenced by its settlement, not by the funding that
 * happened days earlier; a reclaimed one by the reclaim. Linking `hireTxHash`
 * for everything, which is what the proof page did, sends someone to a
 * transaction that proves money went in and says nothing about where it went.
 * So the state picks the hash, and funding is the fallback within a row.
 *
 * The second is that the hash is often missing, and the honest answer then is
 * not "no receipt". Jobs that settle outside this interface — the buyer
 * approving from their own wallet, a status this index learned by reading the
 * chain rather than by sending the transaction — are recorded with their state
 * and no hash, because nothing here sent it. The escrow still holds the job,
 * and the job id is the key to read it, so the fallback is that contract's
 * read page on the job's own chain. `hash: null` says which of the two a
 * caller is getting, so an interface can name the link accurately rather than
 * calling a contract page a receipt.
 *
 * Per chain throughout. Both the explorer and the escrow are resolved from
 * the job's own `chainId`, never a site-wide default: a testnet job linked to
 * mainnet BscScan is a dead link that looks like a working one. `escrowFor`
 * is a function of the chain rather than an address so that a caller cannot
 * pass one chain's job with another chain's contract, and so that this module
 * stays free of the SDK, which ships no ESM entry point and would take the
 * whole file out of reach of the test runner with it.
 */
export function jobReceipt(job: ReceiptSource, escrowFor: (chainId: number) => string): JobReceipt {
  const base = explorerBaseFor(job.chainId);
  const hash =
    (job.status === 'COMPLETED' && job.settleTxHash) ||
    (job.status === 'REJECTED' && job.disputeTxHash) ||
    (job.status === 'EXPIRED' && job.reclaimTxHash) ||
    job.hireTxHash ||
    null;
  if (hash) return { href: `${base}/tx/${hash}`, hash };
  return { href: `${base}/address/${escrowFor(job.chainId)}#readContract`, hash: null };
}
