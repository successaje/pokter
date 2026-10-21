/**
 * Whether a token that left a trading wallet came back. Pure, so the rule a
 * trader relies on is tested without a chain.
 *
 * A delegated trading session (Altana) limits which contracts and functions
 * an agent may call and how much it may spend, but not a call's arguments:
 * a swap can name any recipient. So the check is about the wallet, not the
 * agent: in every transaction where value leaves the wallet, each leg has
 * to go to an address the owner named as their own, or to a real
 * PancakeSwap pool that pays the wallet back in the same transaction.
 * Anything else is shown as not returned, and is what an alert fires on.
 *
 * What this does not judge: whether the price was fair (a swap that returns
 * a pittance still "returns"), and BNB moved directly, which leaves no log.
 * A swap paid out in native BNB therefore reads as not returned: a false
 * alarm, which is the side to be wrong on.
 */

/** keccak256("Transfer(address,address,uint256)"): ERC-20 (3 topics) and ERC-721 (4 topics) alike. */
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
/** keccak256("IncreaseLiquidity(uint256,uint128,uint256,uint256)") on the PancakeSwap V3 position manager. */
export const INCREASE_LIQUIDITY_TOPIC = '0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f';

export interface RawLog {
  address: string;
  topics: readonly string[];
  data: string;
}

export interface OutboundTransfer {
  /** The token contract, or the position manager for a position or a collect. */
  token: string;
  to: string;
  amount: bigint;
  /** `position`: the LP NFT itself left. `collect`: a position's tokens were paid to `to` without passing through the wallet. */
  kind?: 'token' | 'position' | 'collect';
  /** The position, for `position` and `collect`. */
  positionId?: string;
}

export type FlowVerdict = 'returned' | 'added-liquidity' | 'to-owner' | 'not-returned';

export interface TxFlow {
  outs: OutboundTransfer[];
  verdict: FlowVerdict | null;
  /** What came back, in words a trader can check against the explorer. */
  note: string;
}

/** keccak256("Collect(uint256,address,uint256,uint256)") on the PancakeSwap V3 position manager. */
export const COLLECT_TOPIC = '0x40d0efd1a53d60ecbf40971b9daf7dc90178c3aadc7aab1765632738fa8b8f01';

const addr = (topic: string | undefined) => (topic ? `0x${topic.slice(-40)}`.toLowerCase() : '');
const word = (data: string, i: number) => {
  const hex = data.startsWith('0x') ? data.slice(2) : data;
  const w = hex.slice(i * 64, i * 64 + 64);
  return w.length === 64 ? BigInt(`0x${w}`) : 0n;
};

/**
 * The addresses on the other side of the wallet's token transfers, in
 * either direction, so the caller can ask the factory which are real
 * PancakeSwap pools (and holding which tokens) before classifying.
 */
export function poolCandidates(wallet: string, logs: readonly RawLog[]): string[] {
  const w = wallet.toLowerCase();
  const seen = new Set<string>();
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    const from = addr(log.topics[1]);
    const to = addr(log.topics[2]);
    if (from === w && to !== w) seen.add(to);
    else if (to === w && from !== w) seen.add(from);
  }
  return [...seen];
}

/**
 * Classify one transaction's logs for one wallet. `verdict` is null when nothing left the wallet.
 *
 * Every leg out is judged on its own, so one honest swap cannot vouch for
 * a drain in the same transaction. A leg to an address the owner listed is
 * theirs. A leg to a pool is a trade, and a trade has to be paid back:
 * by a real, nonzero transfer of a known token, or a position NFT from the
 * position manager, or liquidity added to a position the wallet holds. A
 * leg anywhere else is not returned, whatever else came in. What counts as
 * "came in" is narrow on purpose: any contract can emit a Transfer log
 * naming the wallet, so a nonzero transfer counts only in a token the
 * wallet trades, or in one of a confirmed pool's own two tokens, from that
 * pool. A fake token cannot be either.
 *
 * A position leaving the wallet, and a position's tokens collected to
 * somebody else, are outflows too, though no token leaves the wallet's own
 * balance in the second.
 */
export function classifyTx(input: {
  wallet: string;
  logs: readonly RawLog[];
  positionManager: string;
  /** Position NFT ids the wallet holds, so a liquidity add to its own position counts as kept. */
  ownedPositions: ReadonlySet<string>;
  /** Other addresses the owner named as theirs. */
  ownerAddresses?: readonly string[];
  /** Tokens whose transfers in count as being paid back (the watched list and the wallet's position tokens). */
  knownTokens: ReadonlySet<string>;
  /** Addresses confirmed on chain to be PancakeSwap pools, with their two tokens (`poolCandidates`, then the factory). */
  pools: ReadonlyMap<string, readonly [string, string]>;
}): TxFlow {
  const wallet = input.wallet.toLowerCase();
  const pm = input.positionManager.toLowerCase();
  const owners = new Set((input.ownerAddresses ?? []).map((a) => a.toLowerCase()));
  const known = new Set([...input.knownTokens].map((a) => a.toLowerCase()));
  const pools = new Map([...input.pools].map(([a, tokens]) => [a.toLowerCase(), tokens.map((t) => t.toLowerCase())]));
  const outs: OutboundTransfer[] = [];
  let tokensIn = 0;
  let positionsIn = 0;
  let addedToOwn = 0;
  for (const log of input.logs) {
    const topic0 = log.topics[0]?.toLowerCase();
    const at = log.address.toLowerCase();
    if (topic0 === TRANSFER_TOPIC) {
      const from = addr(log.topics[1]);
      const to = addr(log.topics[2]);
      const isNft = log.topics.length === 4;
      if (isNft) {
        if (at !== pm) continue;
        const id = BigInt(log.topics[3]).toString();
        if (from === wallet && to !== wallet) outs.push({ token: pm, to, amount: 1n, kind: 'position', positionId: id });
        else if (to === wallet && from !== wallet) positionsIn += 1;
        continue;
      }
      const amount = word(log.data, 0);
      if (from === wallet && to !== wallet && amount > 0n) outs.push({ token: at, to, amount, kind: 'token' });
      else if (to === wallet && from !== wallet && amount > 0n && (known.has(at) || pools.get(from)?.includes(at))) tokensIn += 1;
    } else if (at === pm && topic0 === INCREASE_LIQUIDITY_TOPIC) {
      const tokenId = log.topics[1] ? BigInt(log.topics[1]).toString() : '';
      if (input.ownedPositions.has(tokenId)) addedToOwn += 1;
    } else if (at === pm && topic0 === COLLECT_TOPIC) {
      const tokenId = log.topics[1] ? BigInt(log.topics[1]).toString() : '';
      // Collect(tokenId indexed, recipient, amount0, amount1): the recipient is the first data word.
      const recipient = `0x${(log.data.startsWith('0x') ? log.data.slice(2) : log.data).slice(24, 64)}`.toLowerCase();
      const amount = word(log.data, 1) + word(log.data, 2);
      if (input.ownedPositions.has(tokenId) && recipient !== wallet && amount > 0n) outs.push({ token: pm, to: recipient, amount, kind: 'collect', positionId: tokenId });
    }
  }
  if (outs.length === 0) return { outs: [], verdict: null, note: '' };

  const away = outs.filter((o) => !owners.has(o.to) && !(o.kind === 'token' && pools.has(o.to)));
  if (away.length > 0) {
    const what = away[0].kind === 'position' ? `position #${away[0].positionId} was sent` : away[0].kind === 'collect' ? `position #${away[0].positionId} paid its tokens` : 'tokens were sent';
    return { outs, verdict: 'not-returned', note: `${what} to ${away[0].to}, which is neither a trading pool nor an address you listed` };
  }
  const traded = outs.filter((o) => !owners.has(o.to));
  if (traded.length === 0) return { outs, verdict: 'to-owner', note: 'sent to an address you listed as yours' };
  if (tokensIn > 0 || positionsIn > 0) {
    return { outs, verdict: 'returned', note: [tokensIn ? `${tokensIn} token transfer${tokensIn === 1 ? '' : 's'} back` : '', positionsIn ? 'a position NFT' : ''].filter(Boolean).join(' and ') + ' to the wallet' };
  }
  if (addedToOwn > 0) return { outs, verdict: 'added-liquidity', note: 'added to a position this wallet holds' };
  return { outs, verdict: 'not-returned', note: 'tokens went to a pool and nothing came back in the same transaction' };
}
