/**
 * Where the browser reads chain state during a hire.
 *
 * A mainnet hire failed three times in a row at "Creating job". The
 * wallet prompt was approved, the transaction landed, and the flow then
 * died reading its receipt — the console showed
 * `POST https://bsc-rpc.publicnode.com/ 403 (Forbidden)`. Jobs 56977,
 * 56978 and 56979 are the wreckage: created, never funded, budget zero.
 * No money moved, and the buyer was told "Invalid parameters were
 * provided to the RPC method", which was neither true nor useful.
 *
 * The cause is volume, not correctness. `waitForTransactionReceipt`
 * polls, and the SDK's `publicRpcUrl` for mainnet is a shared public
 * endpoint that rate-limits a browser doing that — the same endpoint
 * answers a server fine, which is why nothing caught it before a real
 * mainnet hire. The reads before the sends are few enough to pass; the
 * poll is what trips it.
 *
 * So the browser gets its own list, ordered, with the chain's own
 * dataseed first. Each was checked from a browser origin: both mainnet
 * entries answer 200 with `access-control-allow-origin: *`, and the
 * SDK's endpoint stays last rather than being dropped — it works, until
 * it is asked too often.
 *
 * Server-side callers keep using `publicRpcUrl` directly. They are not
 * polling from a residential IP and have never hit this.
 */

const BROWSER_RPC: Record<number, readonly string[]> = {
  56: [
    'https://bsc-dataseed.bnbchain.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc-rpc.publicnode.com',
  ],
  97: [
    'https://bsc-testnet-rpc.publicnode.com',
    'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
  ],
};

/**
 * How often a receipt is asked for.
 *
 * viem polls every 4 seconds by default, which is roughly a request
 * every block on BNB Chain and more than a free endpoint will take for
 * long. A hire waits a few seconds longer and stops being throttled
 * out of its own transaction.
 */
export const RECEIPT_POLL_MS = 6_000;

export function browserRpcUrls(chainId: number, fallbackUrl: string): readonly string[] {
  const listed = BROWSER_RPC[chainId];
  if (!listed) return [fallbackUrl];
  return listed.includes(fallbackUrl) ? listed : [...listed, fallbackUrl];
}
