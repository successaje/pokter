import 'server-only';

import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { getJobStore } from '@/lib/erc8183/store';
import { isDemoSeller } from '@/lib/erc8183/demo-seller';
import { summariseAdoption, type AdoptionProgress } from './adoption';

export interface AgentAdoption extends AdoptionProgress {
  /**
   * Why the action count is what it is.
   *
   * Null when the agent performed its own deliveries. Set when Pokter's
   * seller did, which is the case for every mainnet-registered agent: the
   * escrow settles on testnet, the agent's runtime does not watch testnet,
   * and the delivery transaction is therefore Pokter's rather than the
   * agent's. The hires are real; the actions are not the agent's.
   */
  actionsBlockedReason: string | null;
}

/**
 * Adoption for one agent, read from the escrow contract.
 *
 * The job index cannot answer this on its own: it records which agent was
 * chosen but not which wallet funded the escrow, so "three distinct wallets"
 * has to come from chain. The index supplies the job ids to look up.
 *
 * Never throws. A chain read that fails leaves that job uncounted rather
 * than failing the dashboard — an undercount is visibly wrong to the builder
 * and recoverable next load, where an error page is neither.
 */
export async function readAgentAdoption(
  agentChainId: number,
  agentTokenId: string,
  ownerAddresses: string[],
): Promise<AgentAdoption> {
  const indexed = getJobStore()
    .byAgent(agentChainId, agentTokenId)
    .filter((job) => job.chainId === ALTANA_NETWORK.chainId);

  const hires: { jobId: string; client: string; completedAtMs: number }[] = [];
  const actions: { atMs: number }[] = [];
  let pokterDelivered = 0;

  for (const job of indexed) {
    try {
      const onchain = await getErc8183Job(ALTANA_NETWORK, BigInt(job.jobId));

      /*
       * Only completed hires count toward the bar. A funded job that never
       * delivered is money in escrow, not adoption, and counting it would
       * tell a builder they had cleared something they had not.
       */
      if (onchain.statusName !== 'COMPLETED') continue;

      hires.push({
        jobId: job.jobId,
        client: onchain.client,
        completedAtMs: Date.parse(job.statusCheckedAt) || Date.now(),
      });

      /*
       * An action counts only when the agent's own wallet performed it.
       * Pokter's seller delivering on the agent's behalf is Pokter acting,
       * and attributing it to the agent is the one number here that would
       * be worth faking and must not be.
       */
      if (await isDemoSeller(onchain.provider)) {
        pokterDelivered += 1;
        continue;
      }
      if (Number(onchain.submittedAt) > 0) {
        actions.push({ atMs: Number(onchain.submittedAt) * 1000 });
      }
    } catch {
      /* Left uncounted; the next load tries again. */
    }
  }

  const progress = summariseAdoption({ hires, actions, ownerAddresses });

  return {
    ...progress,
    actionsBlockedReason:
      actions.length === 0 && pokterDelivered > 0
        ? `Pokter's own seller delivered ${pokterDelivered === 1 ? 'the hire' : `all ${pokterDelivered} hires`}, because this agent is registered on a different chain from the escrow. Those deliveries are Pokter's transactions, not your agent's.`
        : null,
  };
}
