import type { Address } from 'viem';

import type { ScanAgentDetail } from '@/lib/scan/types';
import type { ProviderChoice } from '@/lib/hire/useHire';
import { demoSellerAddress } from '@/lib/erc8183/demo-seller';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { quotePayableWith } from '@/lib/erc8183/payable';

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
export async function providerChoicesFor(
  agent: ScanAgentDetail,
  escrowChainId: number,
  quote?: { currency: string } | null,
): Promise<ProviderChoice[]> {
  const choices: ProviderChoice[] = [];

  if (agent.agent_wallet) {
    const onEscrowChain = agent.chain_id === escrowChainId;
    /*
     * Registering on the escrow chain is not the same as selling on it.
     *
     * This read only the registration chain, and three of the four reachable
     * chain-97 agents that quote at all price their work in the mainnet
     * payment token — so they were offered here as reachable, with automated
     * delivery, and would then refuse the funded job because the escrow
     * cannot pay them in the money they asked for. The currency the seller
     * named is the cheapest honest test available, and it is already stored
     * with the quote.
     */
    const payable =
      !quote ||
      quotePayableWith(
        quote.currency,
        correctedErc8183Addresses(escrowChainId).paymentToken,
      );
    choices.push({
      address: agent.agent_wallet,
      label: agent.name,
      relationship: 'registry-agent',
      reachable: onEscrowChain && payable,
      automatedDelivery:
        onEscrowChain && payable && Boolean(agent.services?.a2a?.endpoint),
      note: !onEscrowChain
        ? `This agent’s own wallet on chain ${agent.chain_id}. Its runtime does not watch chain ${escrowChainId}.`
        : payable
          ? 'This agent’s own wallet, on the escrow chain.'
          : 'This agent prices its work in a token this escrow cannot pay, so it would refuse the funded job.',
    });
  }

  if (escrowChainId === 97) {
    const address = await demoSellerAddress().catch(() => null);
    if (address) {
      choices.push({
        address,
        label: 'Pokter delivery agent',
        relationship: 'separate-provider',
        reachable: true,
        automatedDelivery: true,
        note: 'Same-chain A2A seller. Verifies escrow, submits a canonical execution receipt and exposes its on-chain proof.',
      });
    }
  }

  choices.push({
    address: VERIFIED_TESTNET_PROVIDER,
    label: 'Verified testnet seller',
    relationship: 'separate-provider',
    reachable: escrowChainId === 97,
    automatedDelivery: false,
    note: 'Three completed jobs at 0.1 $U on chain 97, across yield, rebalancing and grid planning.',
  });

  return choices;
}
