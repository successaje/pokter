import { formatUnits } from 'viem';

import { apiJson, apiOptions, apiRateLimit } from '@/lib/api/respond';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { getJobStore } from '@/lib/erc8183/store';
import { enabledEscrowChains } from '@/lib/network/escrow';
import { chainLabel, explorerBaseFor } from '@/lib/network/presentation';
import { teamWalletList, teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

/**
 * Every job Pokter brokered, as something a stranger can check.
 *
 * `/api/v1/activity` reports counts — eleven completed, 5.85 $U — and a
 * reader who does not already trust Pokter has no way to confirm a
 * single one of them. An assessment put it exactly: source code is
 * evidence of implementation, not proof of production operation. Counts
 * are the same. They are a claim about the chain, written by the party
 * making the claim.
 *
 * This returns the identifiers instead. Chain, escrow contract, job id,
 * status, amount: enough to call `getJob(jobId)` on the contract and get
 * the same answer without asking Pokter anything. Every job Pokter
 * brokers also carries a `pokter-job` envelope in its own on-chain
 * description, so the set is discoverable from the chain alone — this
 * endpoint is a convenience, not the source of truth, and it says so.
 *
 * What is not returned: the buyer's address, the task text, and the
 * deliverable. The job id makes the first findable on chain by anyone
 * who wants it, which is the chain's decision rather than ours; putting
 * it in an API response is ours, and there is no reason to.
 */
export function GET(request: Request) {
  const limited = apiRateLimit(request, 'receipts');
  if (limited) return limited;

  const team = teamWalletSet();
  const jobs = getJobStore()
    .all()
    .slice()
    .sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt));

  const receipts = jobs.map((job) => {
    const explorer = explorerBaseFor(job.chainId);
    return {
      chainId: job.chainId,
      chain: chainLabel(job.chainId),
      testnet: job.chainId === 97,
      jobId: job.jobId,
      escrow: correctedErc8183Addresses(job.chainId).commerce,
      status: job.status,
      provider: job.provider,
      budget: { raw: job.budgetRaw, amountU: formatUnits(BigInt(job.budgetRaw), 18) },
      agent: {
        chainId: job.agentChainId ?? null,
        tokenId: job.agentTokenId,
        name: job.agentName,
      },
      hiredAt: job.hiredAt,
      statusCheckedAt: job.statusCheckedAt,
      /* Pokter's own test hires, marked rather than hidden. */
      fundedByPokter: fundedByTeam(job, team),
      transactionHash: job.hireTxHash ?? null,
      verify: {
        escrowContract: `${explorer}/address/${correctedErc8183Addresses(job.chainId).commerce}#readContract`,
        transaction: job.hireTxHash ? `${explorer}/tx/${job.hireTxHash}` : null,
      },
    };
  });

  return apiJson({
    receipts,
    counts: {
      total: receipts.length,
      byChain: enabledEscrowChains().map((chainId) => ({
        chainId,
        total: receipts.filter((r) => r.chainId === chainId).length,
        completed: receipts.filter((r) => r.chainId === chainId && r.status === 'COMPLETED').length,
      })),
      fundedByPokter: receipts.filter((r) => r.fundedByPokter).length,
    },
    teamWallets: teamWalletList(),
    howToVerify: [
      'Call getJob(jobId) on the escrow contract for that chain. The status, provider and budget come back from the contract, not from Pokter.',
      'Download /api/v1/receipts/verifier to check every row and recompute the totals without installing dependencies.',
      'Every job Pokter brokers carries {"protocol":"pokter-job"} in its on-chain description, so the full set can be found by reading the escrow without using this endpoint at all.',
      'Jobs funded by the wallets in teamWallets are Pokter\'s own tests. They are marked here and excluded from the buyer figures in /api/v1/activity.',
    ],
    scope: 'Jobs commissioned through Pokter and verified against ERC-8183 before indexing. No buyer address, task text or deliverable is returned; the job id makes the buyer findable on chain for anyone who wants it, which is the chain\'s doing.',
  });
}
