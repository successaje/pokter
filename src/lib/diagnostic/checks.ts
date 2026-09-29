import 'server-only';

import { getAgent } from '@/lib/scan/client';
import type { ChainId, ScanAgentDetail } from '@/lib/scan/types';
import { probeAgent, probeTarget } from '@/lib/proof/prober';
import { requestQuote } from '@/lib/erc8183/quote';
import { classify, CATEGORY_BY_ID } from '@/lib/agents/categories';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';

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
  owner: string | null;
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
        `Registered as “${agent.name}”, owned by ${agent.agent_wallet}.`,
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

  checks.push(
    agent.total_feedbacks > 0
      ? ok(
          'attestations',
          'Independent attestations',
          `${agent.total_feedbacks} attestation${agent.total_feedbacks === 1 ? '' : 's'} published on chain.`,
        )
      : unknown(
          'attestations',
          'Independent attestations',
          'No third party has published an attestation about this agent.',
          'Pokter’s own probing never counts toward independence, so an agent measured only by us cannot reach Proven however well it performs.',
        ),
  );

  return {
    chainId,
    tokenId,
    name: agent.name ?? null,
    owner: agent.agent_wallet ?? null,
    checks,
    observedAt: new Date().toISOString(),
  };
}
