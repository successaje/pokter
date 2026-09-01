import type { Address } from 'viem';

import type { ScanAgentDetail } from '@/lib/scan/types';
import type { ProviderChoice } from '@/components/hire/CommissionPanel';

/**
 * A seller we have verified is live on the escrow chain.
 *
 * Chosen from on-chain history rather than a directory listing: this address
 * has three COMPLETED jobs at 0.1 $U on chain 97 (jobs #850, #851, #852),
 * covering yield ranking, rebalance pricing and grid planning — the categories
 * this marketplace is about. It exists so the hire flow can be demonstrated
 * end to end while the escrow with funds is on testnet.
 */
const VERIFIED_TESTNET_PROVIDER: Address =
  '0xdA61DfA428Bb0B04AE6BfC6D3E5F65360592fD7E';

/**
 * Providers offered for a given agent.
 *
 * The agent's own wallet comes first when it has one, marked with whether the
 * escrow chain can actually reach it. We never silently substitute one provider
 * for another: if the agent is on a different chain, the UI says so and the
 * user chooses.
 */
export function providerChoicesFor(
  agent: ScanAgentDetail,
  escrowChainId: number,
): ProviderChoice[] {
  const choices: ProviderChoice[] = [];

  if (agent.agent_wallet) {
    choices.push({
      address: agent.agent_wallet,
      label: agent.name,
      reachable: agent.chain_id === escrowChainId,
      note:
        agent.chain_id === escrowChainId
          ? 'This agent’s own wallet, on the escrow chain.'
          : `This agent’s own wallet on chain ${agent.chain_id}. Its runtime does not watch chain ${escrowChainId}.`,
    });
  }

  choices.push({
    address: VERIFIED_TESTNET_PROVIDER,
    label: 'Verified testnet seller',
    reachable: escrowChainId === 97,
    note:
      'Three completed jobs at 0.1 $U on chain 97, across yield, rebalancing and grid planning.',
  });

  return choices;
}
