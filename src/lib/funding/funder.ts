/**
 * The wallet that first funded an address on BSC mainnet.
 *
 * Read from NodeReal's BSCTrace enhanced API (`nr_getAssetTransfers`), the
 * replacement BNB Chain points to now the BscScan API has no free tier. It
 * covers BSC mainnet only, so testnet owners are never looked up.
 *
 * The first incoming transfer is the funding event: a fresh wallet cannot
 * send anything until something has paid for its gas. Native transfers made
 * by a contract (internal) count too, since that is how many exchanges and
 * bridges fund a wallet.
 */
export const NODEREAL_ENDPOINT = 'https://bsc-mainnet.nodereal.io/v1/';

export interface FunderLookup {
  /** Lower-cased funder address, or null when the wallet has received nothing. */
  funder: string | null;
}

/** NodeReal refuses ranges of 2,000,000 blocks or more. */
const MAX_RANGE = 1_999_000;
/** Its transfer index runs a little behind the chain head. */
const INDEX_LAG = 2_000;
/** Windows searched back from the first send before giving up, about 50 days. */
const MAX_WINDOWS = 5;

/*
 * The transfer API takes at most 1,999,999 blocks and nothing past its own
 * index, so the earlier single call from block 0 to "latest" was refused
 * for every wallet. The funding now has to be found, not asked for: a
 * wallet's nonce only rises, so a binary search over historical nonces
 * finds the block of its first send, and its first funding is the first
 * transfer in on or before that block.
 */
export async function lookupFirstFunder(
  address: string,
  options: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<FunderLookup> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const wallet = address.toLowerCase();
  const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
    const response = await fetchImpl(`${NODEREAL_ENDPOINT}${options.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    if (!response.ok) throw new Error(`NodeReal answered ${response.status}`);
    const payload = (await response.json()) as { result?: T; error?: { message?: string } };
    if (payload.error) throw new Error(`NodeReal: ${payload.error.message ?? 'error'}`);
    return payload.result as T;
  };
  const hex = (n: number) => `0x${n.toString(16)}`;
  const nonceAt = async (block: number) => Number.parseInt(await rpc<string>('eth_getTransactionCount', [wallet, hex(block)]), 16);

  const head = Number.parseInt(await rpc<string>('eth_blockNumber', []), 16) - INDEX_LAG;

  // The block of its first send, or the head if it has never sent.
  let firstSend = head;
  if ((await nonceAt(head)) > 0) {
    let lo = 0;
    let hi = head;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if ((await nonceAt(mid)) > 0) hi = mid;
      else lo = mid + 1;
    }
    firstSend = lo;
  }

  for (let window = 0; window < MAX_WINDOWS; window += 1) {
    const to = firstSend - window * MAX_RANGE;
    if (to < 0) break;
    const from = Math.max(0, to - MAX_RANGE + 1);
    const result = await rpc<{ transfers?: Array<{ from?: string }> }>('nr_getAssetTransfers', [
      { category: ['external', 'internal'], fromBlock: hex(from), toBlock: hex(to), toAddress: wallet, order: 'asc', maxCount: '0x1' },
    ]);
    const funder = result?.transfers?.[0]?.from;
    if (typeof funder === 'string' && /^0x[0-9a-fA-F]{40}$/.test(funder)) return { funder: funder.toLowerCase() };
    if (from === 0) break;
  }
  return { funder: null };
}
