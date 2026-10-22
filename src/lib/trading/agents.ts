/**
 * Agents that trade from the trader's own wallet under a delegated,
 * on-chain-limited session, as their operator describes it.
 *
 * A short, reviewed list rather than something read off agent cards: what
 * an operator says about custody is a claim about other people's money,
 * so each entry is one Pokter has read from the operator's own published
 * tools and says where it came from. Pokter does not verify these claims;
 * it watches the wallet (read.ts) to check the one it can.
 */
export interface DelegatedTrader {
  operator: string;
  product: string;
  setupUrl: string;
  custody: string;
  limits: string;
  controls: { pause: string; revoke: string; withdraw: string };
  source: string;
}

export const DELEGATED_TRADERS: Readonly<Record<string, DelegatedTrader>> = {
  '56:337848': {
    operator: '4LPHA',
    product: 'Grid Agent',
    setupUrl: 'https://4lpha.tech/deploy/grid',
    custody: 'You create and fund a separate passkey wallet on 4lpha.tech. The agent trades from it; its own registered wallet holds no trading funds.',
    limits: 'You sign an Altana session: per-token spend caps, an allowlist of contracts and functions, and an expiry. These limit how much the agent can spend and which calls it can make, not where a swap’s output goes.',
    controls: {
      pause: 'Asks 4LPHA’s server to stop sending trades. Not an on-chain control.',
      revoke: 'Your own on-chain action: the session key stops working at once. Open positions and tokens stay in your wallet.',
      withdraw: 'Close positions and move funds out with your passkey. Close positions first, then revoke, is 4LPHA’s recommended order.',
    },
    source: '4LPHA’s MCP tools explain_strategy and get_hire_link, read 21 October 2026',
  },
};

export function delegatedTrader(chainId: number, tokenId: string): DelegatedTrader | null {
  return DELEGATED_TRADERS[`${chainId}:${tokenId}`] ?? null;
}
