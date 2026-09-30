import { NextResponse } from 'next/server';

import { listSearchable, preferDistinctOwners } from '@/lib/marketplace';
import { verdictFor } from '@/lib/search/match';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { interpretBrief } from '@/lib/brief/interpret';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';

export const dynamic = 'force-dynamic';

const MAX_BRIEF = 400;
const RESULTS = 3;

/**
 * One brief in, matched agents out.
 *
 * A route rather than a server component because the panel that calls it
 * floats above whatever page the reader is on and must not navigate them away
 * from it. It is also where a model would go: the key stays server-side, the
 * browser never holds it, and the content policy would block a call from the
 * page to a third-party API anyway — which is the right outcome.
 *
 * The shape of the answer is fixed here on purpose. Whatever does the reading
 * later, it fills in `reading`; the agents, their order and every number
 * attached to them are produced from what Pokter measured, by this file. A
 * model gets to interpret the question. It does not get to say what is true
 * about an agent.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const brief = (url.searchParams.get('brief') ?? '').trim().slice(0, MAX_BRIEF);

  if (!brief) {
    return NextResponse.json({ error: 'A brief is required.' }, { status: 400 });
  }

  const reading = interpretBrief(brief);
  const meta = reading.category ? CATEGORY_BY_ID.get(reading.category) : null;

  /*
   * A registry that will not answer returns an empty match rather than a 500.
   * The panel says it found nothing, which is true and recoverable; an error
   * would read as the feature being broken.
   */
  const all = await listSearchable({ limit: 30 }).catch(() => []);

  const pool = reading.category
    ? all.filter((entry) => entry.listing.category === reading.category)
    : all;

  const ranked = [...pool].sort((a, b) => {
    const quoted =
      Number(b.listing.quote != null) - Number(a.listing.quote != null);
    if (quoted !== 0) return quoted;
    const answered = b.record.totalAnswered - a.record.totalAnswered;
    if (answered !== 0) return answered;
    return b.listing.attestationCount - a.listing.attestationCount;
  });

  const results = preferDistinctOwners(ranked, RESULTS).map((entry) => {
    const { listing, record } = entry;
    const uptime =
      record.totalProbes === 0
        ? null
        : (record.totalAnswered / record.totalProbes) * 100;

    return {
      name: listing.agent.name,
      href: `/agents/${listing.agent.chain_id}/${listing.agent.token_id}`,
      image: listing.agent.image_url,
      description: listing.agent.description?.trim() ?? null,
      category: CATEGORY_BY_ID.get(listing.category)?.label ?? null,
      verdict: verdictFor(entry),
      verdictLabel: VERDICT_LABEL[verdictFor(entry)],
      uptime,
      probes: record.totalProbes,
      attestations: listing.attestationCount,
      /*
       * Formatted here, not in the browser. Raw quote amounts are small
       * enough to render in scientific notation — a match read "1e-18 $U",
       * which is a price nobody can act on.
       */
      price:
        listing.quote != null
          ? formatQuotedPrice(listing.quote.priceU)
          : null,
    };
  });

  const reply = meta
    ? `Read as ${meta.label.toLowerCase()}. Top ${results.length} by what Pokter has measured — availability and published attestations, with a signed price counted first.`
    : 'Nothing in this brief matched a category Pokter measures, so these are the best-evidenced agents across the whole indexed set rather than a guess at what you meant.';

  return NextResponse.json(
    {
      brief,
      reading: { ...reading, categoryLabel: meta?.label ?? null },
      reply,
      results,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
