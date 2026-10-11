import { BSC_MAINNET, BSC_TESTNET, type ChainId } from '@/lib/scan/types';

/**
 * Reading an agent reference, in the forms other marketplaces write them.
 *
 * Pure and `server-only`-free on purpose. This is the first thing a
 * stranger's request touches, it is the most likely place to be wrong,
 * and a parser that cannot be unit tested is a parser nobody checks.
 */
export const EVIDENCE_CHAINS: ChainId[] = [BSC_MAINNET, BSC_TESTNET];

/** Accepts `56/1234`, `eip155:56:1234`, `97:2554`, or `#1234` on the default chain. */
export function parseAgentRef(
  raw: string,
  fallbackChain: ChainId,
): { chainId: ChainId; tokenId: string } | null {
  const text = raw.trim();
  const caip = text.match(/^eip155:(\d+):(?:0x[0-9a-fA-F]{40}\/)?(\d+)$/);
  const pair = text.match(/^(\d+)\s*[/:]\s*(\d+)$/);
  const bare = text.match(/^#?(\d+)$/);

  const [chain, token] = caip
    ? [Number(caip[1]), caip[2]]
    : pair
      ? [Number(pair[1]), pair[2]]
      : bare
        ? [fallbackChain as number, bare[1]]
        : [Number.NaN, ''];

  /*
   * An unlisted chain is refused rather than quietly retargeted at one
   * Pokter does index. Answering about chain 56 when the caller asked
   * about chain 1 would be a confident report about the wrong agent.
   */
  if (!token || !EVIDENCE_CHAINS.includes(chain as ChainId)) return null;
  return { chainId: chain as ChainId, tokenId: token };
}
