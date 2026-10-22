import type { Address } from 'viem';

import { readVenusPosition } from '@/lib/assay/venus';
import { CHECKED_POOL, type EvidenceRefusalCode, type VenusEvidence } from './venus-report-check';

/**
 * Venus's own figures for one account at one exact block, or an honest
 * refusal.
 *
 * Read-only: three view calls and a block header, no transaction and no
 * signer. It reuses `readVenusPosition`, the same reading the pre-hire
 * check and Brinkwatch itself are built on, pinned to a block — two
 * readings of Venus that could drift apart is exactly what a correctness
 * check must not have.
 *
 * Nothing here ever falls back to the head. That is the point of the
 * module: a verifier that quietly re-read the latest block when the
 * historical read failed would report agreement with a position the report
 * never described, and would be believed.
 */

type VenusClient = Parameters<typeof readVenusPosition>[0];

/**
 * Nodes refusing historical state, in their own words.
 *
 * Measured on 22 October against the endpoints Pokter uses:
 * bsc-rpc.publicnode.com answers "Archive requests require a personal
 * token" beyond about five blocks, and bsc-dataseed.bnbchain.org answers
 * "missing trie node" beyond about a hundred. The rest are the phrasings
 * other BSC and Geth-derived nodes use for the same condition.
 *
 * The distinction is for the reader, not for the verdict: a refusal matched
 * here and one that is not are both "could not verify". Matching it lets
 * the buyer be told "the node no longer keeps that block" instead of being
 * shown a node's error string and left to wonder whether their agent is at
 * fault.
 */
const NO_HISTORY =
  /archive|missing trie node|missing or invalid parameters|state (?:is )?not available|state unavailable|historical state|pruned|header not found|block not found|could not be found|not available on this node|exceeds? (?:the )?defined limit/i;

/**
 * A node's message as one line a buyer can read.
 *
 * viem wraps an RPC error in the URL, the whole request body and a
 * documentation link, and puts the node's actual words after `Details:`.
 * Printing the raw message put four kilobytes of hex calldata on the job
 * page; taking only the first line printed "Missing or invalid parameters.
 * Double check you have provided the correct parameters", which is viem
 * describing a JSON-RPC error code and tells the reader nothing. The
 * `Details:` line is the node speaking: "missing trie node".
 */
function short(error: Error): string {
  const whole = (error.message ?? String(error)).replace(/\s+/g, ' ').trim();
  const details = whole.match(/Details:\s*(.+?)(?:\s+Version:|$)/)?.[1];
  const text = (details ?? whole.split(/(?=\bURL:|\bRequest body:)/)[0]).trim();
  const sentence = text.length > 220 ? `${text.slice(0, 220)}…` : text;
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * Why a read failed, in the two kinds a buyer needs told apart. Pure.
 *
 * Classified on the whole message and not on the shortened one: the node's
 * own words can sit behind viem's wrapper, and a refusal that read "missing
 * trie node" in full was being reported as an unexplained failure because
 * the truncation cut it off before the match.
 */
export function venusReadRefusal(error: Error): { code: Extract<EvidenceRefusalCode, 'no-history' | 'read-failed'>; detail: string } {
  const whole = (error.message ?? String(error)).replace(/\s+/g, ' ').trim();
  return { code: NO_HISTORY.test(whole) ? 'no-history' : 'read-failed', detail: short(error) };
}

/**
 * Read the position at `block`, with the head checked first.
 *
 * The head check is not politeness. A report naming a block the chain has
 * not reached is either a typo or an invention, and without this it would
 * arrive as whatever error the node returns for a future block — on BSC
 * that is "missing trie node", indistinguishable from a pruned past block,
 * and the buyer would be told Pokter could not see rather than that the
 * report named a block that does not exist.
 */
export async function readVenusFactsAt(client: VenusClient, at: { account: string; block: bigint }): Promise<VenusEvidence> {
  const head = await client.getBlockNumber().catch((error: unknown) => error as Error);
  if (head instanceof Error) return { available: false, ...venusReadRefusal(head) };
  if (at.block > head) {
    return { available: false, code: 'block-ahead-of-head', detail: `the chain is at block ${head}.` };
  }

  const reading = await readVenusPosition(client, at.account as Address, { atBlock: at.block }).catch((error: unknown) => error as Error);
  if (reading instanceof Error) return { available: false, ...venusReadRefusal(reading) };

  // A block header is served by pruned nodes too, and a failure here must
  // not cost the verdict: the timestamp is context for the reader, not
  // evidence the comparison rests on.
  const blockTime = await client
    .getBlock({ blockNumber: at.block })
    .then((block) => new Date(Number(block.timestamp) * 1000).toISOString())
    .catch(() => null);

  const collateralUsd = Object.values(reading.rows.collateral).reduce((sum, leg) => sum + leg.amount, 0);
  return {
    available: true,
    facts: {
      chainId: 56,
      account: reading.account,
      pool: CHECKED_POOL,
      block: reading.block,
      blockTime,
      healthFactor: reading.healthFactor,
      borrowLimitRatio: reading.borrowLimitRatio,
      liquidatable: reading.liquidatable,
      debtUsd: reading.borrowUsd,
      collateralUsd,
    },
  };
}
