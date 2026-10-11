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

export async function lookupFirstFunder(
  address: string,
  options: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<FunderLookup> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${NODEREAL_ENDPOINT}${options.apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'nr_getAssetTransfers',
      params: [
        {
          category: ['external', 'internal'],
          fromBlock: '0x0',
          toBlock: 'latest',
          toAddress: address.toLowerCase(),
          order: 'asc',
          maxCount: '0x1',
        },
      ],
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  });
  if (!response.ok) throw new Error(`NodeReal answered ${response.status}`);
  const payload = (await response.json()) as {
    result?: { transfers?: Array<{ from?: string }> };
    error?: { message?: string };
  };
  if (payload.error) throw new Error(`NodeReal: ${payload.error.message ?? 'error'}`);
  const from = payload.result?.transfers?.[0]?.from;
  return { funder: typeof from === 'string' && /^0x[0-9a-fA-F]{40}$/.test(from) ? from.toLowerCase() : null };
}
