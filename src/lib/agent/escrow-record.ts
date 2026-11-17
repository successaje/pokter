import type { Address } from 'viem';

import { JOB_STATUS_NAMES } from '@/lib/erc8183/get-job';
import type { HiredJob } from '@/lib/erc8183/types';
import type { EscrowJob } from '@/lib/quest/store';

/**
 * An agent's whole record on the escrow, not only the jobs hired through
 * Pokter.
 *
 * Pokter's index holds the jobs its own hire flow funded. The escrow is
 * shared, so an agent hired elsewhere is paid by the same contract, and its
 * record is all of them.
 *
 * The escrow names the wallet it pays, not the agent, so a job made
 * elsewhere is attributed by the agent's registered wallet, on the chain the
 * agent is registered on. These rules keep that honest:
 *
 * - A job Pokter's index holds, for any agent, is Pokter's and is left to
 *   the index, which knows which agent it was for.
 * - A wallet registered to more than one agent cannot say which of them did
 *   the work, so its jobs elsewhere are counted for none of them and
 *   reported beside the record instead. Giving each agent the whole count
 *   would multiply one wallet's work by the agents on it.
 * - A job the wallet paid itself is not work anyone bought: left out and
 *   reported.
 * - A job one of Pokter's own wallets funded that the index does not hold
 *   was made outside Pokter's hire flow, such as a test. That flow is what
 *   tells the agent a job is funded, so the agent may never have heard of
 *   it: it counts neither as a delivery nor as a miss, and is reported.
 *
 * A job that was never funded is not in the record anywhere. Everything else
 * enters the same summary Pokter's own jobs do (`agentHistory`), so a missed
 * deadline elsewhere is a miss as surely as a delivery is a delivery, and
 * Pokter's wallets, self-hires and courier jobs are treated alike wherever
 * the job was hired.
 */

export interface ElsewhereSummary {
  /** Jobs another wallet hired elsewhere, in the record. */
  counted: number;
  /** Jobs a Pokter wallet funded outside Pokter's hire flow: not in the record. */
  pokterOutsideFlow: number;
  /** Jobs elsewhere the wallet paid itself for: not in the record. */
  selfPaid: number;
  /** When the wallet is registered to other agents too: its funded jobs elsewhere, not in anyone's record, and how many agents share it. */
  shared: { jobs: number; agents: number } | null;
}

export interface EscrowRecord {
  jobs: HiredJob[];
  elsewhere: ElsewhereSummary;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** A job made elsewhere, in the shape Pokter's record reads, marked as such. Null for a status the kernel does not have. */
export function elsewhereJob(row: EscrowJob, agent: { chainId: number; tokenId: string; name: string }): HiredJob | null {
  const status = JOB_STATUS_NAMES[row.status];
  if (!status) return null;
  const submittedAt = row.submittedAt ? iso(row.submittedAt) : null;
  return {
    id: `escrow:${row.chainId}:${row.jobId}`,
    jobId: String(row.jobId),
    chainId: row.chainId,
    isTestnet: row.chainId === 97,
    agentChainId: agent.chainId,
    agentTokenId: agent.tokenId,
    agentName: agent.name,
    provider: row.provider as Address,
    client: row.client as Address,
    task: '',
    budgetRaw: row.budget,
    paymentToken: (row.paymentToken ?? null) as Address | null,
    expiredAt: iso(row.expiredAt),
    /* Not a hire time: see `HiredJob.origin`. */
    hiredAt: submittedAt ?? iso(row.expiredAt),
    hireTxHash: null,
    status,
    statusCheckedAt: row.statusReadAt ?? '',
    deliverableUrl: null,
    settleTxHash: null,
    origin: 'elsewhere',
    submittedAt,
  };
}

/**
 * Pokter's jobs for an agent, with the escrow's other jobs for its wallet
 * added by the rules above.
 *
 * `escrow` is every indexed job paying `wallet`; `agentsOnWallet` is how
 * many agents on the agent's registry chain the registry names it for.
 */
export function escrowRecord({
  agent,
  pokter,
  wallet,
  escrow,
  agentsOnWallet,
  knownToPokter,
  team,
}: {
  agent: { chainId: number; tokenId: string; name: string };
  pokter: HiredJob[];
  wallet: string | null;
  escrow: EscrowJob[];
  agentsOnWallet: number;
  knownToPokter: (chainId: number, jobId: string) => boolean;
  /** Pokter's own wallets, lower-cased: a job one of them funded outside the index is Pokter's own, not the agent's record. */
  team: ReadonlySet<string>;
}): EscrowRecord {
  const none: EscrowRecord = { jobs: pokter, elsewhere: { counted: 0, pokterOutsideFlow: 0, selfPaid: 0, shared: null } };
  if (!wallet) return none;
  const paid = wallet.toLowerCase();
  const outside = escrow.filter((row) =>
    row.chainId === agent.chainId &&
    row.provider.toLowerCase() === paid &&
    row.status !== 0 &&
    !knownToPokter(row.chainId, String(row.jobId)),
  );
  const selfPaid = outside.filter((row) => row.client.toLowerCase() === paid).length;
  const pokterOutsideFlow = outside.filter((row) => row.client.toLowerCase() !== paid && team.has(row.client.toLowerCase())).length;
  const bought = outside.filter((row) => row.client.toLowerCase() !== paid && !team.has(row.client.toLowerCase()));
  if (agentsOnWallet > 1) {
    return { jobs: pokter, elsewhere: { counted: 0, pokterOutsideFlow, selfPaid, shared: bought.length ? { jobs: bought.length, agents: agentsOnWallet } : null } };
  }
  const added = bought.flatMap((row) => elsewhereJob(row, agent) ?? []);
  return { jobs: [...pokter, ...added], elsewhere: { counted: added.length, pokterOutsideFlow, selfPaid, shared: null } };
}

/** "1 through Pokter, 4 elsewhere": where the funded jobs in a record came from, or null when all came through Pokter. */
export function originNote(funded: number, elsewhere: ElsewhereSummary): string | null {
  const parts: string[] = [];
  if (elsewhere.counted) parts.push(`${Math.max(0, funded - elsewhere.counted)} through Pokter, ${elsewhere.counted} elsewhere`);
  if (elsewhere.shared) {
    parts.push(`${elsewhere.shared.jobs} more on a wallet ${elsewhere.shared.agents} agents share, not counted`);
  }
  if (elsewhere.selfPaid) parts.push(`${elsewhere.selfPaid} it paid itself elsewhere, not counted`);
  if (elsewhere.pokterOutsideFlow) parts.push(`${elsewhere.pokterOutsideFlow} Pokter funded outside its hire flow, not counted`);
  return parts.length ? parts.join(' · ') : null;
}
