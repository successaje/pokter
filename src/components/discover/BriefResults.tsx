import Link from 'next/link';

import { AgentCard } from '@/components/AgentCard';
import { listSearchable, preferDistinctOwners } from '@/lib/marketplace';
import { offersDirectHire, verdictFor } from '@/lib/search/match';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { interpretBrief } from '@/lib/brief/interpret';

/**
 * What Pokter made of the brief, and what it found.
 *
 * The reading is shown before the results, not after and not hidden. A panel
 * that answers a question in natural language is the easiest place in this
 * product to quietly start making claims — so it states what it understood,
 * what it understood it from, and which part of the system did the
 * understanding, and then every result carries its own evidence badge. If the
 * reading is wrong the reader can see that it is wrong rather than wondering
 * why the answers look odd.
 */
export async function BriefResults({ brief }: { brief: string }) {
  const reading = interpretBrief(brief);
  const all = await listSearchable({ limit: 30 }).catch(() => []);

  const pool = reading.category
    ? all.filter((entry) => entry.listing.category === reading.category)
    : all;

  /*
   * Ranked on what has been measured, exactly as the catalogue is. The brief
   * decides which agents are candidates; it never decides which is better,
   * because being asked for in a sentence is not evidence.
   */
  const ranked = [...pool].sort((a, b) => {
    const quoted =
      Number(b.listing.quote != null) - Number(a.listing.quote != null);
    if (quoted !== 0) return quoted;
    const answered = b.record.totalAnswered - a.record.totalAnswered;
    if (answered !== 0) return answered;
    return b.listing.attestationCount - a.listing.attestationCount;
  });

  const results = preferDistinctOwners(ranked, 6);
  const meta = reading.category ? CATEGORY_BY_ID.get(reading.category) : null;

  return (
    <section
      id="brief-results"
      aria-labelledby="brief-results-title"
      className="flex scroll-mt-24 flex-col gap-5"
    >
      {/*
        The reading, in one line.
        
        It had a quoted brief, a heading, a badge, a sentence, a term list and
        a caveat stacked in a bordered box — more apparatus explaining the
        answer than answer. What a reader needs is whether it understood them,
        which is one line, and the terms, which are the proof of that line.
      */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-[color:var(--text-muted)]">
        <span className="text-[color:var(--text-secondary)]">
          Read as{' '}
          <span className="font-semibold text-[color:var(--text)]">
            {meta?.label ?? 'no category Pokter measures'}
          </span>
        </span>
        {reading.matched.map((term) => (
          <span
            key={term}
            className="rounded-full bg-[color:var(--brand-highlight-soft)] px-2 py-px text-[11px] font-medium text-[color:var(--brand-strong)]"
          >
            {term}
          </span>
        ))}
        <span
          title={
            reading.by === 'model'
              ? 'A language model read this brief.'
              : 'Matched on terms, not by a model.'
          }
          className="rounded-full border border-[color:var(--border)] px-2 py-px text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]"
        >
          {reading.by === 'model' ? 'Model' : 'Keywords'}
        </span>
        <Link
          href="/discover"
          className="ml-auto text-[color:var(--text-faint)] underline decoration-dotted underline-offset-2 hover:text-[color:var(--text)]"
        >
          Clear
        </Link>
      </p>

      <h2 id="brief-results-title" className="sr-only">
        Agents matching your brief
      </h2>

      {results.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-5 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
          Nothing in the indexed set matches this brief. That is a fact about
          the registry rather than a gap in the page —{' '}
          <Link href="/agents" className="underline underline-offset-2">
            the whole catalogue
          </Link>{' '}
          shows the same evidence.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((entry) => (
            <AgentCard
              key={`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`}
              listing={entry.listing}
              verdict={verdictFor(entry)}
              record={entry.record}
              hirable={offersDirectHire(entry)}
            />
          ))}
        </div>
      )}

      {/*
        The limit, in one sentence. It has to be here — a ranked list implies
        the ranking settled the question, and two of the five scoring
        dimensions are permanently unmeasured — but it does not need a
        paragraph to say so.
      */}
      <p className="text-[11px] text-[color:var(--text-faint)]">
        Ranked on availability and published evidence, signed prices first.
        Nothing here scores whether an agent makes money —{' '}
        <Link href="/methodology" className="underline underline-offset-2">
          why
        </Link>
        .
      </p>
    </section>
  );
}
