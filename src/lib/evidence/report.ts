import 'server-only';

import { CATEGORY_BY_ID, categorySignalSource, type Category } from '@/lib/agents/categories';
import { quotePayableOn } from '@/lib/erc8183/payable';
import { getComparison, type Comparison } from '@/lib/marketplace';
import { isTeamWallet } from '@/lib/alerts/team-wallets';
import { parseAgentRef } from '@/lib/evidence/refs';
import type { ChainId } from '@/lib/scan/types';

export { parseAgentRef };

/**
 * What Pokter measured about one agent, as an answer another marketplace
 * can hire.
 *
 * Pokter's catalogue is a web page, which means its measurements are worth
 * something only to the people already on it. The probe archive is the one
 * asset here nobody else can assemble — thirty-five thousand calls across
 * two hundred sweeps — and it is currently locked behind a visit.
 *
 * This is that archive as a service: give it an agent, it returns what was
 * observed, with the provenance of each claim attached. It reports and it
 * never ranks. The moment it recommends, Pokter is grading competitors
 * inside their own catalogues, which is the conflict the whole thing has
 * to avoid to be worth hiring.
 *
 * Every field carries where it came from, because a verification service
 * that asks to be taken on trust is the thing it exists to replace.
 */

export type Provenance = 'pokter-measured' | 'onchain' | 'declared' | 'calculated';

export interface Claim<T> {
  value: T;
  provenance: Provenance;
  source: string;
}

export interface EvidenceReport {
  agent: Claim<{ chainId: number; tokenId: string; name: string }>;
  owner: Claim<string>;
  category: Claim<string>;
  /** Calls Pokter made, and how many came back. The core of the thing. */
  calls: Claim<{ taken: number; answered: number; observedDays: number }>;
  /** Null when never called: an unmeasured agent is not a failing one. */
  uptime: Claim<number | null>;
  answeringToday: Claim<boolean>;
  /** Whether a signed price exists and whether an escrow could pay it. */
  price: Claim<{ signed: string | null; payableOnEscrowChain: boolean | null }>;
  settledJobs: Claim<{ funded: number; completed: number }>;
  /** Stated, not buried: a Pokter-operated wallet is disclosed as one. */
  operatedByPokter: Claim<boolean>;
  /** The limits of this report, in the report. */
  caveats: string[];
  link: string;
}

const UNMEASURED =
  'Pokter has never successfully called this agent. That is a gap in our coverage, not a finding about the agent.';

function claim<T>(value: T, provenance: Provenance, source: string): Claim<T> {
  return { value, provenance, source };
}

/**
 * Where an agent's category came from, said accurately.
 *
 * This reported every category as `calculated` and added that it was "not
 * declared by the publisher". For most agents that is backwards: a
 * declared tag is close to decisive in the classifier, so the category is
 * the publisher's own word that Pokter accepted. Pokter's own evidence
 * agent carried the error about itself — tagged `token-safety` at
 * registration, reported as Pokter's calculation.
 *
 * A service whose whole claim is that every field says where it came from
 * cannot be wrong about where a field came from.
 */
function categoryClaim(
  agent: Comparison['agent'],
  category: string,
): Claim<string> {
  const meta = CATEGORY_BY_ID.get(category as Category);
  if (!meta) {
    return claim(
      'Unclassified',
      'calculated',
      "Pokter's classifier could not place this agent in one of its categories with enough confidence. Not a finding about the agent.",
    );
  }
  const source = categorySignalSource(agent, meta.id);
  if (source === 'declared') {
    return claim(
      meta.label,
      'declared',
      'Declared by the publisher in the registry record and accepted by Pokter. Pokter did not verify that the agent does this.',
    );
  }
  return claim(
    meta.label,
    'calculated',
    source === 'name'
      ? "Inferred by Pokter's classifier from the agent's own name, not from a declared category."
      : "Inferred by Pokter's classifier from the registry description, not from a declared category.",
  );
}

export function buildReport(
  chainId: ChainId,
  tokenId: string,
  dossier: Comparison,
  origin: string,
): EvidenceReport {
  const { agent, record, quote, economicHistory } = dossier;
  const taken = record.totalProbes;
  const answered = record.totalAnswered;
  const today = record.windows.find((window) => window.label === '24h');

  /*
   * Payability, which is the check almost nothing else makes.
   *
   * A quote can verify perfectly, recover to the right wallet, and still
   * be unpayable because it names another chain's token — the escrow
   * takes the buyer's money and the seller can never accept. Reporting a
   * signed price without saying whether it can be settled would repeat
   * the mistake this measurement exists to catch.
   */
  const payable = quote ? quotePayableOn(chainId, quote.currency) : null;

  const caveats: string[] = [
    'Pokter measures whether an agent answers and what it quotes. It does not verify that the work is correct, and nothing here is a statement about profitability.',
  ];
  if (taken === 0) caveats.push(UNMEASURED);
  if (quote && payable === false) {
    caveats.push(
      'The signed price names a token this escrow cannot settle, so a funded job could not be accepted.',
    );
  }

  return {
    agent: claim(
      { chainId, tokenId, name: agent.name },
      'onchain',
      'ERC-8004 registry record.',
    ),
    owner: claim(
      agent.owner_address,
      'onchain',
      'ERC-8004 registry record. The wallet that signs quotes is on the agent page.',
    ),
    category: categoryClaim(agent, dossier.category),
    calls: claim(
      { taken, answered, observedDays: record.observedDays },
      'pokter-measured',
      'Pokter probes only. Third-party probe counts are not included.',
    ),
    uptime: claim(
      taken > 0 ? answered / taken : null,
      'pokter-measured',
      taken > 0 ? 'Answered over taken, across the observed window.' : UNMEASURED,
    ),
    answeringToday: claim(
      Boolean(today && today.probes > 0 && (today.ratio ?? 0) > 0),
      'pokter-measured',
      'At least one answered probe in the last 24 hours.',
    ),
    price: claim(
      {
        signed: quote ? `${quote.priceU} $U` : null,
        payableOnEscrowChain: payable,
      },
      quote ? 'onchain' : 'pokter-measured',
      quote
        ? `Signed by the agent's own wallet, checked against the escrow token on chain ${chainId}.`
        : 'This agent has never returned a signed price to Pokter.',
    ),
    settledJobs: claim(
      { funded: economicHistory.jobs, completed: economicHistory.completed },
      'onchain',
      'ERC-8183 jobs Pokter has indexed. Jobs placed through other marketplaces may not appear.',
    ),
    operatedByPokter: claim(
      isTeamWallet(agent.owner_address),
      'declared',
      'Pokter declares its own wallets in docs/phase-2/tracking.md and excludes them from its own counts.',
    ),
    caveats,
    link: `${origin.replace(/\/$/, '')}/agents/${chainId}/${tokenId}`,
  };
}

export async function evidenceFor(
  chainId: ChainId,
  tokenId: string,
  origin: string,
): Promise<EvidenceReport> {
  const dossier = await getComparison(chainId, tokenId);
  return buildReport(chainId, tokenId, dossier, origin);
}
