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
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-faint)]">
          Your brief
        </p>
        <p className="max-w-3xl text-[15px] leading-relaxed text-[color:var(--text)]">
          &ldquo;{brief}&rdquo;
        </p>

        <div className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
            <span className="font-semibold text-[color:var(--brand-strong)]">
              What Pokter read
            </span>
            {/*
              Named so a keyword match can never be mistaken for something
              cleverer. When a model does this work the badge changes, and the
              difference stays visible rather than being absorbed silently.
            */}
            <span className="rounded-full border border-[color:var(--border-strong)] px-2 py-px text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
              {reading.by === 'model' ? 'Language model' : 'Keyword match'}
            </span>
          </p>
          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            {reading.because}
          </p>
          {reading.matched.length > 0 && (
            <p className="flex flex-wrap gap-1.5">
              {reading.matched.map((term) => (
                <span
                  key={term}
                  className="rounded-[var(--radius)] bg-[color:var(--brand-highlight-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--brand-strong)]"
                >
                  {term}
                </span>
              ))}
            </p>
          )}
          {!reading.category && (
            <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
              Pokter indexes four financial categories. A job outside them is
              not a worse job — it is outside what this marketplace can
              currently measure, and guessing would be worse than saying so.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="brief-results-title" className="text-base font-medium tracking-tight">
          {results.length === 0
            ? 'No agent indexed for this yet'
            : meta
              ? `${meta.label} agents, ranked on evidence`
              : 'Every indexed agent, ranked on evidence'}
        </h2>
        <p className="text-[11px] text-[color:var(--text-faint)]">
          Agents that have returned a signed price come first.
        </p>
      </div>

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
        The limits of the answer, stated with it. A results panel that stops at
        the results implies the ranking settled the question; it did not, and
        two of the five scoring dimensions are permanently unmeasured.
      */}
      <p className="max-w-3xl text-[12px] leading-relaxed text-[color:var(--text-muted)]">
        This ranks on availability and published evidence. It says nothing about
        whether an agent makes money — nobody publishes that, so Pokter does not
        score it. Read{' '}
        <Link href="/methodology" className="underline underline-offset-2">
          the methodology
        </Link>{' '}
        for what each figure is built from.
      </p>
    </section>
  );
}
