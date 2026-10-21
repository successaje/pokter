/**
 * Whether a token that left a trading wallet came back. Pure, so the rule a
 * trader relies on is tested without a chain.
 *
 * A delegated trading session (Altana) limits which contracts and functions
 * an agent may call and how much it may spend, but not a call's arguments:
 * a swap can name any recipient. So the check is about the wallet, not the
 * agent: in every transaction where tokens leave the wallet, something has
 * to come back to it in the same transaction, or the tokens have to go to an
 * address the owner named as their own. Anything else is shown as not
 * returned, and is what an alert fires on.
 *
 * What this does not judge: whether the price was fair (a swap that returns
 * a pittance still "returns"), and BNB moved directly, which leaves no log.
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
  token: string;
  to: string;
  amount: bigint;
}

export type FlowVerdict = 'returned' | 'added-liquidity' | 'to-owner' | 'not-returned';

export interface TxFlow {
  outs: OutboundTransfer[];
  verdict: FlowVerdict | null;
  /** What came back, in words a trader can check against the explorer. */
  note: string;
}

const addr = (topic: string | undefined) => (topic ? `0x${topic.slice(-40)}`.toLowerCase() : '');

/** Classify one transaction's logs for one wallet. `verdict` is null when nothing left the wallet. */
export function classifyTx(input: {
  wallet: string;
  logs: readonly RawLog[];
  positionManager: string;
  /** Position NFT ids the wallet holds, so a liquidity add to its own position counts as kept. */
  ownedPositions: ReadonlySet<string>;
  /** Other addresses the owner named as theirs. */
  ownerAddresses?: readonly string[];
}): TxFlow {
  const wallet = input.wallet.toLowerCase();
  const pm = input.positionManager.toLowerCase();
  const owners = new Set((input.ownerAddresses ?? []).map((a) => a.toLowerCase()));
  const outs: OutboundTransfer[] = [];
  let tokensIn = 0;
  let positionsIn = 0;
  let addedToOwn = 0;
  for (const log of input.logs) {
    const topic0 = log.topics[0]?.toLowerCase();
    if (topic0 === TRANSFER_TOPIC) {
      const from = addr(log.topics[1]);
      const to = addr(log.topics[2]);
      const isNft = log.topics.length === 4;
      if (from === wallet && !isNft && to !== wallet) outs.push({ token: log.address.toLowerCase(), to, amount: log.data && log.data !== '0x' ? BigInt(log.data) : 0n });
      if (to === wallet && from !== wallet) {
        if (isNft) positionsIn += 1;
        else tokensIn += 1;
      }
    } else if (topic0 === INCREASE_LIQUIDITY_TOPIC && log.address.toLowerCase() === pm) {
      const tokenId = log.topics[1] ? BigInt(log.topics[1]).toString() : '';
      if (input.ownedPositions.has(tokenId)) addedToOwn += 1;
    }
  }
  const sent = outs.filter((o) => o.amount > 0n);
  if (sent.length === 0) return { outs: [], verdict: null, note: '' };
  if (tokensIn > 0 || positionsIn > 0) {
    return { outs: sent, verdict: 'returned', note: [tokensIn ? `${tokensIn} token transfer${tokensIn === 1 ? '' : 's'} back` : '', positionsIn ? 'a position NFT' : ''].filter(Boolean).join(' and ') + ' to the wallet' };
  }
  if (addedToOwn > 0) return { outs: sent, verdict: 'added-liquidity', note: 'added to a position this wallet holds' };
  if (sent.every((o) => owners.has(o.to))) return { outs: sent, verdict: 'to-owner', note: 'sent to an address you listed as yours' };
  return { outs: sent, verdict: 'not-returned', note: 'tokens left the wallet and nothing came back in the same transaction' };
}
