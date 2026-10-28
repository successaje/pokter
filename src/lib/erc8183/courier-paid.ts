import { mapWithConcurrency } from '@/lib/concurrency';
import { withTimeout } from '@/lib/net/bounded';

import type { HiredJob } from './types';

type WalletRead = (chainId: number, tokenId: string) => Promise<{ answered: boolean; wallet: string | null }>;

const READ_MS = 4_000;

const agentOf = (job: HiredJob) => `${job.agentChainId ?? job.chainId}:${job.agentTokenId}`;

/**
 * Which jobs the escrow paid to Pokter's courier instead of the agent.
 *
 * A Pokter wallet as a job's provider says Pokter delivered it. For the
 * courier, that wallet is paid in the agent's place; but Pokter's own
 * agents are registered to a Pokter wallet as well, and a job paid to the
 * agent's own registered wallet is the agent's paid work. So, as on the job
 * page (`loadJobEvidence`), a job paid to a Pokter wallet is the courier's
 * unless the registry names that wallet as the agent's. A registry that
 * does not answer leaves it the courier's: a figure then says Pokter was
 * paid, never that the agent was.
 *
 * One read per agent with a Pokter-paid job among `jobs`, a dozen or so,
 * and the caller passes `registeredWalletRead`, which keeps them briefly.
 */
export async function courierPaidTest(jobs: readonly HiredJob[], team: ReadonlySet<string>, readWallet: WalletRead): Promise<(job: HiredJob) => boolean> {
  const paidToPokter = (job: HiredJob) => typeof job.provider === 'string' && team.has(job.provider.toLowerCase());
  const agents = [...new Map(jobs.filter(paidToPokter).map((job) => [agentOf(job), job] as const)).values()];
  const own = new Map<string, string>();
  await mapWithConcurrency(agents, 4, async (job) => {
    const read = await withTimeout(readWallet(job.agentChainId ?? job.chainId, job.agentTokenId), 'agentWallet', READ_MS).catch(() => null);
    if (read?.answered && read.wallet) own.set(agentOf(job), read.wallet.toLowerCase());
  });
  return (job) => paidToPokter(job) && own.get(agentOf(job)) !== job.provider!.toLowerCase();
}
