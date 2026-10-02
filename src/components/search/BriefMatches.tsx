import Link from 'next/link';

import { AgentCard } from '@/components/AgentCard';
import { offersDirectHire, verdictFor, type SearchableAgent } from '@/lib/search/match';

/**
 * What the hero's question produced, said once and then got out of the way.
 *
 * Deliberately the same card as the catalogue below it. A bespoke "match" card
 * would be a second way of describing an agent, and the moment two of those
 * exist they disagree — the evidence badge means one thing here and something
 * slightly different four hundred pixels further down.
 *
 * It states that this is a reading of the words rather than a ranking, because
 * it is: the category comes from matching terms, and being wrong about that is
 * ordinary. Saying so is what makes the catalogue underneath feel like the
 * answer rather than the consolation prize.
 */
export function BriefMatches({
  brief,
  categoryLabel,
  entries,
}: {
  brief: string;
  categoryLabel: string | null;
  entries: SearchableAgent[];
}) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand)]">
          {categoryLabel ? `Read as ${categoryLabel}` : 'Best evidenced'}
        </p>
        <Link
          href="/agents"
          className="text-[11px] text-[color:var(--text-muted)] underline decoration-dotted underline-offset-2 hover:text-[color:var(--text)]"
        >
          Clear
        </Link>
      </div>

      <p className="font-[family-name:var(--font-serif)] text-[17px] leading-snug [overflow-wrap:anywhere]">
        &ldquo;{brief}&rdquo;
      </p>

      {entries.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          Nothing indexed matches this yet. The whole catalogue is below.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <AgentCard
                key={`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`}
                listing={entry.listing}
                verdict={verdictFor(entry)}
                record={entry.record}
                history={entry.history}
                hirable={offersDirectHire(entry)}
              />
            ))}
          </div>
          {/*
            Said before the choice, not at the funding screen.

            A reader arriving from "how close is my position to liquidation"
            reasonably expects something that keeps watching. Nothing here
            does: each agent answers once, when asked, and none of them can
            touch a wallet. Learning that two screens later is how someone
            stops at the last step.
          */}
          <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            These answer once, when you hire them, and return a written
            assessment. None of them watches a position, sends alerts, or
            executes a transaction.
          </p>
          <p className="text-[11px] text-[color:var(--text-faint)]">
            Matched on measured evidence, with a signed price counted first.
            Everything indexed is below.
          </p>
        </>
      )}
    </section>
  );
}
