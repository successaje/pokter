import { formatUnits } from 'viem';

import { apiJson, apiOptions, apiRateLimit, originOf } from '@/lib/api/respond';
import { jobEvidencePath } from '@/lib/jobs/evidence-view';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { getJobStore } from '@/lib/erc8183/store';
import { isDollarUJob, jobToken } from '@/lib/erc8183/job-amount';
import { paymentTokenAt } from '@/lib/network/tokens';
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
  const origin = originOf(request);
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
      /*
       * In the job's own token. `amountU` is kept for $U jobs, as published;
       * for any other money it is null and `amount`/`symbol` say what it is.
       * An unknown token is `token: null`, never presented as $U.
       */
      budget: (() => {
        const token = jobToken(job);
        const known = token ? paymentTokenAt(job.chainId, token) : null;
        return {
          raw: job.budgetRaw,
          amountU: isDollarUJob(job) ? formatUnits(BigInt(job.budgetRaw), 18) : null,
          token: token ?? null,
          symbol: known ? (known.symbol === 'U' ? '$U' : known.symbol) : null,
          amount: known ? formatUnits(BigInt(job.budgetRaw), known.decimals) : null,
        };
      })(),
      agent: {
        chainId: job.agentChainId ?? null,
        tokenId: job.agentTokenId,
        name: job.agentName,
      },
      hiredAt: job.hiredAt,
      statusCheckedAt: job.statusCheckedAt,
      /* Pokter's own test hires, marked rather than hidden. */
      fundedByPokter: fundedByTeam(job, team),
      /*
       * Buyer and seller the same wallet. Published because excluding these
       * from the demand figures is a claim, and a claim nobody can check is
       * worth nothing on a page about being checkable: the escrow names both
       * parties, so a reader can confirm this field rather than trust it.
       */
      selfHire: Boolean(job.client) && job.client!.toLowerCase() === job.provider.toLowerCase(),
      transactionHash: job.hireTxHash ?? null,
      /* Additive: the job's public evidence page, which reads it from the escrow and checks its delivery. */
      page: `${origin}${jobEvidencePath(job)}`,
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
      selfHire: receipts.filter((r) => r.selfHire).length,
      /* Outside money, and not the operator paying their own agent. */
      outsideDemand: receipts.filter((r) => !r.fundedByPokter && !r.selfHire).length,
    },
    teamWallets: teamWalletList(),
    howToVerify: [
      /*
       * Said as "check it" rather than "it came from there".
       *
       * This claimed the status, provider and budget came back from the
       * contract rather than from Pokter. They are served from Pokter's
       * index, which is re-read from chain but can lag or be wrong — and
       * was: job 97/1522 was published with another agent's wallet for 54
       * minutes on 16 October 2026. The sentence invited readers to skip
       * the one check that would have caught it.
       */
      'Call getJob(jobId) on the escrow contract for that chain and compare. These rows are Pokter\'s own index, re-read from chain but capable of lagging it, so the contract is the authority and this is not.',
      'Download /api/v1/receipts/verifier to check every row and recompute the totals without installing dependencies.',
      'Every job Pokter brokers carries {"protocol":"pokter-job"} in its on-chain description, so the full set can be found by reading the escrow without using this endpoint at all.',
      'Jobs funded by the wallets in teamWallets are Pokter\'s own tests. They are marked here and excluded from the buyer figures in /api/v1/activity.',
      'A job marked selfHire has the same wallet on both sides, so it is an operator funding their own agent rather than demand. Three such jobs were counted as outside demand until 14 October 2026; getJob returns both parties, so this is checkable rather than a promise.',
      'One row per job, now enforced by the index itself. Until 17 October 2026 a job could be recorded twice — two writers minted two different row ids — and 14 of 124 jobs were, so these counts were about 11% high and one delivery was credited to an agent that did not make it.',
    ],
    scope: 'Jobs commissioned through Pokter and verified against ERC-8183 before indexing. No buyer address, task text or deliverable is returned; the job id makes the buyer findable on chain for anyone who wants it, which is the chain\'s doing.',
  });
}
