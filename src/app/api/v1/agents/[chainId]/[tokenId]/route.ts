import { getDossier } from '@/lib/marketplace';
import type { ChainId } from '@/lib/scan/types';
import { API_VERSION, wirePrice } from '@/lib/api/v1';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import { deliveryAdjustedVerdict } from '@/lib/search/match';
import { dossierLadder } from '@/lib/agents/dossier-ladder';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { escrowOptionsForHire } from '@/lib/network/escrow';
import { apiError, apiJson, apiOptions, apiRateLimit, originOf } from '@/lib/api/respond';
import { currentHireBlockerWithCard, type BlockerSource } from '@/lib/hire/blocker-live';

export const dynamic = 'force-dynamic';
/*
 * This route calls the agent when no sweep has priced it (see
 * `currentHireBlockerWithCard`), so it carries a bound like every other
 * route that talks to a third party. The card read's own 2.5s budget does
 * not cover the DNS lookup that precedes it, which is why the ceiling is
 * here and not left implicit.
 */
export const maxDuration = 20;

export function OPTIONS() {
  return apiOptions();
}

/**
 * Where a hire blocker came from, in the caller's words.
 *
 * One sentence per `BlockerSource`, keyed so a source added later cannot
 * fall through to another's sentence. This is the endpoint that explains
 * the evidence behind every claim, and it spent a revision asserting a
 * sweep price request for a quote a buyer had asked for minutes earlier.
 */
const BLOCKER_SOURCE: Record<BlockerSource, string> = {
  sweep: 'The latest sweep’s read-only price request to the agent.',
  brief: 'A signed quote Pokter got for a buyer’s own brief, which no enabled escrow settles.',
  card: 'Pokter’s own read of the agent card, made for this request because no sweep has priced this agent.',
};

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

  const { agent, proof, record, score, attestations, live, quote } = dossier;
  // The escrow the agent page offers first, so the ladder and `payable`
  // here say what that page says.
  const escrowChain = escrowOptionsForHire(quote?.currency)[0] ?? ALTANA_NETWORK.chainId;
  const { maturity, payable, history } = dossierLadder(dossier, escrowChain);
  // The same delivery rule the agent page and catalogue apply.
  const adjusted = deliveryAdjustedVerdict(proof.verdict, history);
  const origin = originOf(request);
  /*
   * Reads the agent's card only when the sweep has no verdict on it, which
   * is the one case this endpoint used to answer with no blocker at all.
   */
  const blocker = await currentHireBlockerWithCard(agent, quote, payable, agent.services?.a2a?.endpoint);

  return apiJson({
    version: API_VERSION,
    chainId: agent.chain_id,
    tokenId: agent.token_id,
    name: agent.name,
    description: agent.description ?? null,
    owner: agent.owner_address ?? null,
    agentWallet: agent.agent_wallet ?? null,

    evidence: {
      verdict: adjusted.verdict,
      verdictLabel: VERDICT_LABEL[adjusted.verdict],
      rationale: adjusted.note ? `${proof.rationale} ${adjusted.note}` : proof.rationale,
      /** Third parties only. Pokter is never counted here. */
      measurers: proof.measurers,
      measurersExcludePokter: true,
      attestations: attestations.map((a) => ({
        declaredMeasurer: a.measuredBy,
        authorAddress: a.authorAddress,
        independence: a.independence,
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

    /*
     * The step the agent page names in its title, and every step behind
     * it. `verdict` above is availability; this is how far the evidence
     * goes, and the two answer different questions.
     */
    /*
     * Why it cannot be priced or hired right now, in words its owner can
     * act on. Null when it has a signed price an escrow can pay, or when
     * nothing Pokter holds or can read says otherwise.
     *
     * `source` says which it is, because the two are not equally strong: a
     * sweep result is a measured price request, and a card read is this
     * request looking at what the agent publishes.
     */
    hireBlocker: blocker
      ? {
          code: blocker.code,
          reason: blocker.reason,
          transient: blocker.transient,
          fix: `https://pokter.xyz${blocker.fix.href}`,
          observedAt: blocker.observedAt,
          provenance: 'pokter-measured',
          source: BLOCKER_SOURCE[blocker.from],
        }
      : null,

    ladder: {
      current: maturity.current,
      label: maturity.label,
      sustained: maturity.sustained,
      /*
       * `state` beside `earned`, not instead of it. A reader that only
       * knows `earned` keeps the answer it always had, and one that reads
       * `state` can tell "nothing happened" from "something happened that
       * this step does not certify" — the courier delivery, which the
       * label and detail name in full.
       */
      steps: maturity.steps.map(({ id, label, earned, state, detail }) => ({ id, label, earned, state, detail })),
    },

    /*
     * Null is a fact about the agent: it has never returned a signed quote.
     * `payable` is whether the escrow Pokter would fund the hire on settles
     * in the quoted token; a price nobody can pay is still a price, and is
     * reported as one.
     */
    price: quote
      ? {
          /* In its own token; `amountU` only when that token is $U (`wirePrice`). */
          ...wirePrice(quote),
          signer: quote.signer,
          quotedAt: quote.quotedAt,
          expiresAt: quote.expiresAt ?? null,
          current: dossier.quoteCurrent,
          payable,
          /*
           * The escrow this price settles on, which is none when no enabled
           * escrow holds its token. It used to report the chain the hire
           * would run on — testnet, always offered as a fallback — so a
           * mainnet agent quoting USDT published `escrowChainId: 97`, which
           * reads as "this price settles on 97" and is false twice over.
           * Where a hire would actually run is `hire`, below.
           */
          escrowChainId: payable === false ? null : escrowChain,
          provenance: 'attested',
          source: 'Quoted by the agent and signed by its registered wallet, in the token named by `currency`. `amount` is exact in that token; `amountU` is null unless it is $U.',
        }
      : null,

    /*
     * Where a hire would run, which is a different question from where the
     * signed price settles. Testnet is always offered while it is enabled,
     * because an agent whose price no escrow can pay can still be tried
     * there — Pokter's delivery agent carries the task and the buyer sets
     * the budget. Reporting that chain inside `price` made it look like the
     * agent's own quote settled there.
     */
    hire: {
      escrowChainId: escrowChain,
      escrowOptions: escrowOptionsForHire(quote?.currency),
      priceSettlesHere: payable === true,
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
  },
  200,
  /*
   * A blocker from this request's own card read is not sweep-cycle data:
   * it is dated to this request and may be a transient "could not check".
   * The shared 30s/150s cache would re-serve one of those long after the
   * agent started answering again.
   */
  { perRequest: blocker?.from === 'card' },
  );
}
