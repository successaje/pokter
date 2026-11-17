import 'server-only';

import { getJobStore } from '@/lib/erc8183/store';
import { getQuestStore } from '@/lib/quest/store';
import { teamAddressSet } from '@/lib/team/wallets';
import { escrowRecord, type EscrowRecord } from './escrow-record';

/**
 * The jobs behind an agent's record: Pokter's, and the escrow's others for
 * its registered wallet (`escrowRecord` says which count and why).
 *
 * Every figure that calls itself the agent's work reads this, on the
 * profile, the catalogue card, the evidence ladder and the public API, so
 * none of them can count jobs elsewhere while another leaves them out.
 *
 * The wallet is the one the registry names, as the sweep last read it, and
 * the agent's own listing's wallet when the sweep has not read one yet. A
 * job index that will not open leaves the record as Pokter's alone rather
 * than failing the page.
 */
export function agentRecordJobs(agent: { chain_id: number; token_id: string; name?: string | null; agent_wallet?: string | null }): EscrowRecord {
  const jobs = getJobStore();
  const pokter = jobs.byAgent(agent.chain_id, agent.token_id);
  try {
    const index = getQuestStore();
    const wallet = index.walletOf(agent.chain_id, agent.token_id) ?? agent.agent_wallet?.toLowerCase() ?? null;
    if (!wallet) return pokterOnly(pokter);
    /* This agent among them, whether or not the sweep has read its wallet yet. */
    const sharing = new Set([...index.agentsOnWallet(agent.chain_id, wallet).map((a) => a.tokenId), agent.token_id]);
    return escrowRecord({
      agent: identity(agent),
      pokter,
      wallet,
      escrow: index.byProvider(agent.chain_id, wallet),
      agentsOnWallet: sharing.size,
      knownToPokter: (chainId, jobId) => jobs.knowsJob(chainId, jobId),
      team: teamAddressSet(),
    });
  } catch {
    return pokterOnly(pokter);
  }
}

function pokterOnly(pokter: EscrowRecord['jobs']): EscrowRecord {
  return { jobs: pokter, elsewhere: { counted: 0, unindexed: 0, selfPaid: 0, shared: null } };
}

function identity(agent: { chain_id: number; token_id: string; name?: string | null }) {
  return { chainId: agent.chain_id, tokenId: agent.token_id, name: agent.name ?? `Agent #${agent.token_id}` };
}
