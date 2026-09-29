import { getDossier } from '@/lib/marketplace';
import type { ChainId } from '@/lib/scan/types';
import { API_VERSION } from '@/lib/api/v1';
import { apiError, apiJson, apiOptions, apiRateLimit, originOf } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

/**
 * One agent, with the evidence behind every claim.
 *
 * This is the endpoint that can say `proven`, because it decodes attestations
 * to the measurers behind them. The list endpoint cannot and does not.
 *
 * `measurers` excludes Pokter deliberately and says so in the payload. A
 * caller counting measurers to judge independence would otherwise count our
 * own probing as corroboration of itself.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ chainId: string; tokenId: string }> },
) {
  const limited = apiRateLimit(request, 'agent-detail', 30);
  if (limited) return limited;

  const { chainId: rawChain, tokenId } = await params;
  const chainId = Number(rawChain) as ChainId;
  if (chainId !== 56 && chainId !== 97) {
    return apiError('Supported chains are 56 and 97.', 400);
  }
  if (!/^\d+$/.test(tokenId)) {
    return apiError('Token id must be the ERC-8004 registry number.', 400);
  }

  let dossier: Awaited<ReturnType<typeof getDossier>>;
  try {
    dossier = await getDossier(chainId, tokenId);
  } catch {
    return apiError(`No agent ${tokenId} on chain ${chainId}.`, 404);
  }

  const { agent, proof, record, score, attestations, live } = dossier;
  const origin = originOf(request);

  return apiJson({
    version: API_VERSION,
    chainId: agent.chain_id,
    tokenId: agent.token_id,
    name: agent.name,
    description: agent.description ?? null,
    owner: agent.owner_address ?? null,
    agentWallet: agent.agent_wallet ?? null,

    evidence: {
      verdict: proof.verdict,
      rationale: proof.rationale,
      /** Third parties only. Pokter is never counted here. */
      measurers: proof.measurers,
      measurersExcludePokter: true,
      attestations: attestations.map((a) => ({
        measuredBy: a.measuredBy,
        dimension: a.dimension,
        ratio: a.ratio,
        window: a.window,
        verified: a.verified,
        transactionHash: a.transactionHash,
      })),
      /*
       * Rounded to one place. The raw value carries fourteen decimals, which
       * is arithmetic rather than precision: it is a weighted average of
       * uptime ratios over a few dozen probes, and publishing it unrounded
       * would assert a resolution the evidence does not have. The interface
       * rounds to a whole number; one decimal keeps a little more for a
       * caller sorting on it without pretending to any more than that.
       */
      score: {
        overall:
          score.overall === null ? null : Math.round(score.overall * 10) / 10,
        measuredDimensions: score.measuredDimensions,
        totalDimensions: score.totalDimensions,
        note: 'Computed only over dimensions carrying real data, and rounded to one decimal. Coverage travels with the number.',
      },
    },

    measured: {
      probes: record.totalProbes,
      answered: record.totalAnswered,
      observedDays: record.observedDays,
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen,
      medianResponseMs: live?.medianMs ?? null,
      capabilities: live?.capabilities ?? [],
      note: 'Pokter probes only, from scheduled sweeps. Liveness is not correctness.',
    },

    /*
     * Named rather than omitted. A caller integrating this will look for
     * returns and drawdown, and an absent field reads as an oversight; a
     * present one that says why nobody has it reads as the answer it is.
     */
    notMeasured: {
      returns: 'No measurer attests to realised profit and loss.',
      drawdown: 'Requires a position history nobody publishes.',
      capitalManaged: 'Agent wallets are not linked to strategy balances.',
      gasAndSlippage: 'Executions are not attributable to this agent on-chain.',
    },

    links: {
      html: `${origin}/agents/${agent.chain_id}/${agent.token_id}`,
      diagnostic: `${origin}/compatibility`,
      methodology: `${origin}/methodology`,
    },
    observedAt: new Date().toISOString(),
  });
}
