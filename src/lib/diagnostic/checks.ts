import 'server-only';

import { getAgent, listFeedbacks } from '@/lib/scan/client';
import type { ChainId, ScanAgentDetail, ScanFeedback } from '@/lib/scan/types';
import { attestationAuthors } from '@/lib/proof/attestation-authors';
import { probeAgent, probeTarget } from '@/lib/proof/prober';
import { POKTER_TERMS, requestQuote } from '@/lib/erc8183/quote';
import { sampleBrief } from '@/lib/erc8183/sample-enquiry';
import { hireBlocker } from '@/lib/hire/blocker';
import { readAgentCard } from '@/lib/agents/agent-card';
import { cardChecks } from './card-checks';
import type { QuoteFailure } from '@/lib/hire/failure';
import { classify, CATEGORIES, CATEGORY_BY_ID } from '@/lib/agents/categories';
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
  /** The refusal code a buyer's hire would meet, when this check maps to one. */
  code?: string;
  /** The integration kit section that explains the fix. */
  fixUrl?: string;
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

/** What to change for each way a quote fails, in the builder's terms. */
const QUOTE_REMEDY: Record<string, string> = {
  'no-price-skill': 'Add a `negotiate` skill to your agent card, named for the work, that answers with a signed quote.',
  'no-quote': 'Return `negotiation_hash`, `provider_sig`, `negotiated_at` and `response.terms.price` and `currency` with `accepted: true`. A price alone is not a quote.',
  'bad-signature': 'Sign `negotiation_hash` (EIP-191) with the private key of the `agent_wallet` in your ERC-8004 registration, or update the registration to the wallet you sign with.',
  'terms-mismatch': 'Hash exactly the content Pokter recomputes: the canonical JSON of version, negotiated_at, task, terms, price, currency and any expiry or chain binding you return. The kit shows the rule and a worked example.',
  'payment-incompatible': 'Quote in $U on the chain you want to be hired on: the payment token addresses are in the kit.',
  'quote-expired': 'Set `quote_expires_at` minutes in the future, in seconds since the epoch, and check your server clock.',
  'seller-declined': 'Price a brief that names its inputs, and decline only with what is missing, in words a buyer can act on.',
  'auth-required': 'Leave the agent card, `negotiate` and `notify_funded` open to anonymous calls. Buyers and Pokter hold no credentials for your endpoint.',
  'no-endpoint': 'Publish an A2A endpoint over https in your registration file, with an agent card that declares a JSON-RPC interface. MCP alone can be measured but not priced.',
  timeout: 'Answer `negotiate` within 12 seconds, the time Pokter’s checks and price requests wait (a hire waits 20). Sign the quote first and do any heavy work after funding.',
  unreachable: 'Make the registered endpoint reachable over public https and return your agent card from it.',
  'http-error': 'Answer `negotiate` with HTTP 200 and a JSON-RPC result, including when you decline.',
  'rate-limited': 'Allow at least a few requests a minute from Pokter: each check and each buyer quote is one call.',
  'seller-not-ready': 'Return the signed quote in the reply to `negotiate`, not in a task to poll later.',
};

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

  // MCP can be measured, but prices and hires go over A2A: say so here, where the builder looks first.
  if (target.protocol === 'mcp') {
    return {
      id: 'endpoint',
      label: 'Published endpoint',
      status: 'fail',
      detail: `Publishes an MCP endpoint at ${origin} and no A2A endpoint. Pokter can measure it, but a price is negotiated over A2A, so it cannot be priced or hired.`,
      remedy: 'Add an A2A endpoint with an agent card that declares negotiate and notify_funded. Keep the MCP endpoint if assistants use it.',
      code: 'no-endpoint',
      fixUrl: 'https://pokter.xyz/build/integration#transports',
    };
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
        : /*
           * Two quite different things, and this said the first about both.
           *
           * No capabilities means either "it answered and declared none" or
           * "nothing answered, so there was no card to read". The second is
           * the ordinary case of an endpoint that is down, and it was being
           * reported as "The endpoint answered but named no skills" —
           * directly under a liveness check saying the request failed with
           * ENOTFOUND. One of the two lines was false on every unreachable
           * agent, and it was this one.
           */
          unknown(
            'card',
            'Published capabilities',
            reading.answered > 0
              ? 'The endpoint answered but named no skills Pokter could read.'
              : 'Not read: nothing answered at the published endpoint, so there was no agent card to read.',
            reading.answered > 0
              ? 'Publish a skills array in your agent card. Pokter reads it to tell buyers what you actually do rather than guessing from your description.'
              : 'Fix the endpoint first. Pokter reads the skills from the card the endpoint serves.',
          ),
    );

    // What the card says about being hired: notify_funded, a named priced skill, concrete examples.
    if (reading.protocol === 'a2a' && reading.endpoint) {
      const card = await readAgentCard(reading.endpoint).catch(() => null);
      if (card) checks.push(...cardChecks(card));
    }

    /*
     * The quote is the check that matters most commercially: it is the only
     * way a price exists, and an agent that will not quote shows as “No price
     * quoted” on every card in the marketplace.
     */
    /*
     * Asked the way the sweep asks, and reported the way the sweep records
     * it. This said only "no signed quote was returned" whatever happened,
     * while the sweep knew the exact cause: Hevo's agents sign their quote,
     * with a wallet other than the one they registered, and a builder who
     * ran this check was told to publish a skill they already had.
     */
    let failure: QuoteFailure | null = null;
    let refusal: string | null = null;
    let quote = await requestQuote(agent, {
      onFailure: (reason) => {
        failure = reason;
      },
      onRefused: (reason) => {
        refusal = reason;
      },
    });
    // Declined a brief that names nothing to price: ask once with a real job, as the sweep does.
    let declinedGeneric: string | null = null;
    const sample = !quote && refusal ? sampleBrief(classify(agent)) : null;
    if (sample) {
      declinedGeneric = refusal as string | null;
      let retryFailure: QuoteFailure | null = null;
      let retryRefusal: string | null = null;
      quote = await requestQuote(agent, {
        enquiry: { task_description: sample, terms: POKTER_TERMS },
        onFailure: (reason) => {
          retryFailure = reason;
        },
        onRefused: (reason) => {
          retryRefusal = reason;
        },
      });
      if (!quote && retryFailure) {
        failure = retryFailure;
        refusal = retryRefusal ?? refusal;
      }
    }
    if (quote) {
      checks.push(
        ok(
          'quote',
          'Signed price quote',
          `Quoted ${formatQuotedPrice(quote.priceU, quote.currency)}, signed by ${quote.signer}, which matches the registered agent wallet.` +
            (declinedGeneric
              ? ` It declined Pokter's generic enquiry ("${(declinedGeneric as string).slice(0, 140)}") and priced a sample brief for its category, which Pokter now asks when a generic one is declined.`
              : ''),
        ),
      );
    } else {
      const known = failure as QuoteFailure | null;
      const blocker = known
        ? hireBlocker({ code: known.code, detail: known.detail ?? null, sellerReason: refusal ?? known.sellerReason ?? null, agentWallet: agent.agent_wallet, protocols: reading.protocol ? [reading.protocol] : [] })
        : null;
      checks.push({
        id: 'quote',
        label: 'Signed price quote',
        status: 'fail',
        detail: blocker ? blocker.reason : 'No signed quote was returned for a read-only negotiation.',
        remedy: QUOTE_REMEDY[known?.code ?? ''] ?? 'Publish the `negotiate` skill and return `negotiation_hash` and `provider_sig` with a price and currency, signed by your registered agent wallet.',
        ...(known ? { code: known.code } : {}),
        fixUrl: `https://pokter.xyz${blocker?.fix.href ?? '/build/integration#quote'}`,
      });
    }
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
          'Pokter’s classifier could not place this agent in one of its five categories with enough confidence.',
          /*
           * This said categories are "assigned by Pokter, not declared",
           * and pointed builders at their description. That is the
           * opposite of how the classifier works: a declared tag carries
           * 0.9 of the 1.0 confidence budget, the name 0.7, and prose
           * 0.6 with saturation — so the advice sent people to the least
           * effective field and told them the most effective one did not
           * exist. It also matters the other way: a tag that does not
           * describe the agent is close to decisive too, which is how
           * Pokter's own evidence agent came to be listed under Token
           * Safety and described as a token-safety agent.
           */
          'A category tag in your registry record is close to decisive, so declare the one that genuinely fits — and no tag at all beats a tag that does not, which would have Pokter describe your agent as something it is not. Pokter recognises: ' +
            CATEGORIES.map((category) => category.id).join(', ') + '.',
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
