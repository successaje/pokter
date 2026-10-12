import 'server-only';

import { getAgent, listFeedbacks } from '@/lib/scan/client';
import type { ChainId, ScanAgentDetail, ScanFeedback } from '@/lib/scan/types';
import { attestationAuthors } from '@/lib/proof/attestation-authors';
import { probeAgent, probeTarget } from '@/lib/proof/prober';
import { requestQuote } from '@/lib/erc8183/quote';
import { classify, CATEGORY_BY_ID } from '@/lib/agents/categories';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { enabledEscrowChains, escrowChainForCurrency } from '@/lib/network/escrow';
import { quoteUsableForEscrow } from '@/lib/erc8183/negotiation';

/**
 * One thing Pokter tried to observe, and what happened.
 *
 * `status` is deliberately three-valued. A check that could not be run is not
 * a failure — an agent that publishes no endpoint has not failed its quote
 * check, it has made the quote check impossible — and collapsing those two
 * into a red mark would tell an operator to fix the wrong thing.
 */
export type CheckStatus = 'pass' | 'fail' | 'unknown';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** What Pokter saw. Always a statement of observation, never advice. */
  detail: string;
  /** What to change, when there is something to change. */
  remedy?: string;
}

export interface DiagnosticReport {
  chainId: ChainId;
  tokenId: string;
  name: string | null;
  /** ERC-721 owner of the ERC-8004 identity. */
  owner: string | null;
  /** Operational wallet published by the agent for signed interactions. */
  agentWallet: string | null;
  checks: DiagnosticCheck[];
  observedAt: string;
}

/** An agent id Pokter could not even look up. */
export class AgentNotFound extends Error {}

function ok(
  id: string,
  label: string,
  detail: string,
): DiagnosticCheck {
  return { id, label, status: 'pass', detail };
}

function bad(
  id: string,
  label: string,
  detail: string,
  remedy: string,
): DiagnosticCheck {
  return { id, label, status: 'fail', detail, remedy };
}

function unknown(
  id: string,
  label: string,
  detail: string,
  remedy?: string,
): DiagnosticCheck {
  return { id, label, status: 'unknown', detail, remedy };
}

/** Registry identity: the only check that can stop the rest. */
function identityCheck(agent: ScanAgentDetail): DiagnosticCheck {
  return agent.agent_wallet
    ? ok(
        'identity',
        'ERC-8004 identity',
        `Registered as “${agent.name}” with signing wallet ${agent.agent_wallet}.`,
      )
    : bad(
        'identity',
        'ERC-8004 identity',
        `Registered as “${agent.name}”, but the record publishes no agent wallet.`,
        'Publish an agent wallet in the registry. Without one no signature can be checked against you, so nothing you sign can be trusted here.',
      );
}

function endpointCheck(agent: ScanAgentDetail): DiagnosticCheck {
  const target = probeTarget(agent);
  if (!target) {
    return bad(
      'endpoint',
      'Published endpoint',
      'The registry record names no A2A or MCP endpoint.',
      'Publish a service endpoint in your ERC-8004 record. Pokter cannot measure an agent it has no address for, and unmeasured agents stay Unproven.',
    );
  }
  /*
   * Only the origin is echoed back. The full endpoint can carry a path that
   * an operator would not expect to see quoted in a shareable report.
   */
  let origin = target.endpoint;
  try {
    origin = new URL(target.endpoint).origin;
  } catch {
    // Keep the raw value: a malformed endpoint is itself worth showing.
  }

  return ok(
    'endpoint',
    'Published endpoint',
    // "an" for both: A2A and MCP are said as letters, so both open on a vowel.
    `Publishes an ${target.protocol.toUpperCase()} endpoint at ${origin}.`,
  );
}

/**
 * The whole diagnostic, run live.
 *
 * Deliberately the same calls the marketplace itself makes — the prober, the
 * quote negotiation, the classifier — so a builder reading this sees what
 * Pokter sees rather than a friendlier summary of it. A diagnostic that ran
 * different code from the marketplace would be reassuring and useless.
 */
export async function diagnose(
  chainId: ChainId,
  tokenId: string,
): Promise<DiagnosticReport> {
  let agent: ScanAgentDetail;
  try {
    agent = await getAgent(chainId, tokenId);
  } catch (error) {
    throw new AgentNotFound((error as Error).message);
  }

  const checks: DiagnosticCheck[] = [identityCheck(agent), endpointCheck(agent)];
  const reachable = Boolean(probeTarget(agent));

  // Liveness, measured now rather than read from history.
  if (!reachable) {
    checks.push(
      unknown(
        'liveness',
        'Answers when called',
        'Not attempted: there is no endpoint to call.',
      ),
      unknown(
        'card',
        'Published capabilities',
        'Not attempted: the agent card lives behind the endpoint.',
      ),
      unknown(
        'quote',
        'Signed price quote',
        'Not attempted: a quote is negotiated over the endpoint.',
      ),
      unknown(
        'quote-settles',
        'Quote can be paid',
        'Not attempted: there is no quote to check against the escrow.',
      ),
    );
  } else {
    const reading = await probeAgent(agent, { samples: 2 });
    checks.push(
      reading.answered > 0
        ? ok(
            'liveness',
            'Answers when called',
            `${reading.answered} of ${reading.probes.length} probes answered${
              reading.medianMs === null ? '' : `, median ${reading.medianMs} ms`
            }.`,
          )
        : bad(
            'liveness',
            'Answers when called',
            reading.probes[0]?.detail ??
              'No probe completed against the published endpoint.',
            'A probe counts as answered only when the endpoint returns well-formed JSON; an HTTP 200 alone is not enough.',
          ),
    );

    checks.push(
      reading.capabilities.length > 0
        ? ok(
            'card',
            'Published capabilities',
            `Publishes ${reading.capabilities.length} skill${reading.capabilities.length === 1 ? '' : 's'}: ${reading.capabilities.join(', ')}.`,
          )
        : unknown(
            'card',
            'Published capabilities',
            'The endpoint answered but named no skills Pokter could read.',
            'Publish a skills array in your agent card. Pokter reads it to tell buyers what you actually do rather than guessing from your description.',
          ),
    );

    /*
     * The quote is the check that matters most commercially: it is the only
     * way a price exists, and an agent that will not quote shows as “No price
     * quoted” on every card in the marketplace.
     */
    const quote = await requestQuote(agent);
    checks.push(
      quote
        ? ok(
            'quote',
            'Signed price quote',
            `Quoted ${formatQuotedPrice(quote.priceU)}, signed by ${quote.signer}, which matches the registered agent wallet.`,
          )
        : bad(
            'quote',
            'Signed price quote',
            'No signed quote was returned for a read-only negotiation.',
            'Publish the `negotiate` skill and return `negotiation_hash` and `provider_sig` with a price and currency. Pokter discards any price whose signature does not recover to your registered wallet, and lists you with no price at all.',
          ),
    );
    /*
     * A quote that verifies and still cannot govern a job.
     *
     * The check above ends at "the agent signed a price", which is where
     * the marketplace used to stop looking — and most agents that have
     * ever quoted priced their work in a token the escrow of the day
     * could not settle, so the money could never move. Each read as a
     * healthy listing, could not be bought, and the builder had no way to
     * discover that from their own agent.
     *
     * Judged against every escrow Pokter can fund on, not one of them.
     * This read a single configured network, from when the site had one
     * escrow. Hires now settle on whichever enabled escrow matches the
     * quote's own currency, so a mainnet-priced quote is payable whenever
     * mainnet is enabled — and telling its builder to reprice it was
     * advice to break a working listing. The failure above is still real
     * and still reported: a price in a token no enabled escrow settles in
     * cannot be funded by anyone here.
     */
    const escrows = enabledEscrowChains();
    const settles = quote ? escrowChainForCurrency(quote.currency, escrows) : null;
    const tokenList = escrows
      .map((chainId) => `${correctedErc8183Addresses(chainId).paymentToken} on chain ${chainId}`)
      .join(', or ');
    if (!quote) {
      checks.push(
        unknown(
          'quote-settles',
          'Quote can be paid',
          'Not attempted: no quote was returned to check.',
        ),
      );
    } else if (settles === null) {
      checks.push(
        bad(
          'quote-settles',
          'Quote can be paid',
          `Priced in ${quote.currency}, which is not a token any escrow Pokter funds on settles in.`,
          `Quote in ${tokenList}. A price in another chain's currency is signed honestly and still cannot be paid from these escrows, so the job would never be funded against you.`,
        ),
      );
    } else {
      const usable = quoteUsableForEscrow(
        {
          expiresAt: quote.expiresAt ? Date.parse(quote.expiresAt) / 1000 : undefined,
          domain: quote.domain
            ? { chainId: quote.domain.chainId, verifyingContract: quote.domain.verifyingContract as `0x${string}` }
            : undefined,
        },
        settles,
      );
      checks.push(
        usable.usable
          ? ok(
              'quote-settles',
              'Quote can be paid',
              quote.domain
                ? `Priced in the escrow token for chain ${settles} and signed for chain ${quote.domain.chainId}, which is where the job is funded.`
                : `Priced in the escrow token for chain ${settles}, and the quote is not bound to another chain.`,
            )
          : bad(
              'quote-settles',
              'Quote can be paid',
              usable.reason,
              `Bind the quote's signing domain to chain ${settles}, which is the escrow its currency settles in. A quote signed for anywhere else describes a job Pokter cannot create.`,
            ),
      );
    }
  }

  const category = classify(agent);
  checks.push(
    category === 'unclassified'
      ? unknown(
          'category',
          'Marketplace category',
          'Pokter’s classifier could not place this agent in one of its four categories with enough confidence.',
          'Categories are assigned by Pokter, not declared. Naming the protocol and the outcome in your registry description is what the classifier reads.',
        )
      : ok(
          'category',
          'Marketplace category',
          `Classified as ${CATEGORY_BY_ID.get(category)?.label ?? category}.`,
        ),
  );

  /*
   * Independence, judged by who wrote the attestation.
   *
   * This counted rows. The reputation registry refuses an agent's owner —
   * `giveFeedback` from the owner of 97/2599 reverts with "Self-feedback
   * not allowed", and the same call from an unrelated address is accepted
   * — so a row was never the owner praising themselves and the count was
   * nearly right. But Pokter runs wallets that own no agent, and one of
   * them reviewing a Pokter-operated agent writes a row that passes a
   * count and is independent of nobody. The verdict engine already
   * excludes Pokter from its measurer list, so the check would have
   * claimed an independent attestation that the engine refused to count:
   * Pokter contradicting itself on the one measure it asks to be judged
   * on, in the panel a builder reads to understand why.
   */
  const authors =
    agent.total_feedbacks > 0
      ? await attestationAuthors(
          chainId,
          agent.owner_address,
          (await listFeedbacks({ chainId, agentId: agent.id, limit: 50 }).catch(() => ({
            items: [] as ScanFeedback[],
          }))).items,
        )
      : { total: 0, independent: 0, related: 0, undetermined: 0 };

  /*
   * A row whose author could not be read is reported as that, not as an
   * absence. "No third party has attested" when three have and the RPC
   * simply did not answer is the kind of confident wrong statement this
   * whole panel exists to replace.
   */
  const notes = [
    authors.related > 0
      ? `${authors.related} from a Pokter wallet, which Pokter does not count as independent of itself`
      : null,
    authors.undetermined > 0
      ? `${authors.undetermined} whose author Pokter could not read from chain, counted neither way`
      : null,
  ].filter((note): note is string => note !== null);
  const aside = notes.length > 0 ? ` Of the rest: ${notes.join('; ')}.` : '';

  checks.push(
    authors.independent > 0
      ? ok(
          'attestations',
          'Independent attestations',
          `${authors.independent} attestation${authors.independent === 1 ? '' : 's'} published on chain by a wallet unrelated to this agent and to Pokter.${aside}`,
        )
      : unknown(
          'attestations',
          'Independent attestations',
          authors.total === 0
            ? 'No third party has published an attestation about this agent.'
            : `${authors.total} attestation${authors.total === 1 ? '' : 's'} on chain, none of them from a wallet Pokter can count as independent.${aside}`,
          'Pokter’s own probing and its own wallets never count toward independence, so an agent measured only by us cannot reach Proven however well it performs.',
        ),
  );

  return {
    chainId,
    tokenId,
    name: agent.name ?? null,
    owner: agent.owner_address ?? null,
    agentWallet: agent.agent_wallet ?? null,
    checks,
    observedAt: new Date().toISOString(),
  };
}
