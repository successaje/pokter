import Link from 'next/link';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { listSearchable, preferDistinctOwners } from '@/lib/marketplace';
import { verdictFor } from '@/lib/search/match';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { interpretBrief } from '@/lib/brief/interpret';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';

function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 2.5c.35 3.9 2.6 6.15 6.5 6.5-3.9.35-6.15 2.6-6.5 6.5-.35-3.9-2.6-6.15-6.5-6.5 3.9-.35 6.15-2.6 6.5-6.5Z" />
      <path d="M18.5 15.5c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3Z" />
    </svg>
  );
}

/**
 * The answer, in the same card the question was asked in.
 *
 * The reply line is written from what the reading actually found rather than
 * composed to sound assured. "I matched the top three by evidence quality and
 * verified performance above benchmark" is the sentence this panel wants to
 * say and cannot: performance is one of the two dimensions nobody publishes,
 * so a sentence claiming it would be the product doing the exact thing it
 * exists to catch agents doing.
 *
 * Every row carries its own evidence badge, so a match the reading got wrong
 * is visibly wrong rather than dressed in the confidence of the sentence above
 * it.
 */
export async function AskResults({ brief }: { brief: string }) {
  const reading = interpretBrief(brief);
  const all = await listSearchable({ limit: 30 }).catch(() => []);
  const meta = reading.category ? CATEGORY_BY_ID.get(reading.category) : null;

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

  const results = preferDistinctOwners(ranked, 3);

  const reply = meta
    ? `Read as ${meta.label.toLowerCase()}. These are the top ${results.length} by what Pokter has measured — availability and published attestations, with a signed price counted first.`
    : 'Nothing in this brief matched a category Pokter measures, so these are the best-evidenced agents across the whole indexed set rather than a guess at what you meant.';

  return (
    <section
      id="ask"
      aria-label="Matched agents"
      className="scroll-mt-24 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
    >
      <header className="flex items-start gap-3 border-b border-[color:var(--border)] p-4 sm:p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]">
          <Spark className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-semibold">Ask Pokter</span>
          <span className="truncate text-[13px] text-[color:var(--text-muted)]">
            &ldquo;{brief}&rdquo;
          </span>
        </span>
        <Link
          href="/discover"
          aria-label="Close"
          className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
        >
          ✕
        </Link>
      </header>

      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]">
            <Spark className="size-3.5" />
          </span>
          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            {reply}
          </p>
        </div>

        {results.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-[color:var(--border)] p-5 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
            Nothing in the indexed set matches this. That is a fact about the
            registry rather than a gap in the page.
          </p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {results.map((entry, index) => {
              const { listing, record } = entry;
              const { agent } = listing;
              const categoryMeta = CATEGORY_BY_ID.get(listing.category);
              const uptime =
                record.totalProbes === 0
                  ? null
                  : (record.totalAnswered / record.totalProbes) * 100;

              return (
                <li key={`${agent.chain_id}:${agent.token_id}`}>
                  <Link
                    href={`/agents/${agent.chain_id}/${agent.token_id}`}
                    className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3.5 transition-colors hover:border-[color:var(--brand)] hover:bg-[color:var(--surface-hover)] sm:gap-4"
                  >
                    <span className="tabular hidden size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface)] text-[12px] font-semibold text-[color:var(--text-muted)] sm:flex">
                      #{index + 1}
                    </span>

                    <AgentAvatar name={agent.name} src={agent.image_url} size="sm" />

                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={
                            index === 0
                              ? 'text-[14px] font-semibold text-[color:var(--brand-strong)]'
                              : 'text-[14px] font-semibold'
                          }
                        >
                          {agent.name}
                        </span>
                        {categoryMeta && (
                          <span className="mono rounded-[var(--radius)] bg-[color:var(--surface)] px-1.5 py-px text-[10px] text-[color:var(--text-muted)]">
                            {categoryMeta.label}
                          </span>
                        )}
                        {/*
                          "Best match" is a statement about this ranking, not
                          about the agent. It is the first row of an evidence
                          sort, and the badge beside it says what that evidence
                          actually amounts to.
                        */}
                        {index === 0 && (
                          <span className="rounded-[var(--radius)] bg-[color:var(--brand-highlight-soft)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[color:var(--brand-strong)]">
                            Best match
                          </span>
                        )}
                        <EvidenceBadge verdict={verdictFor(entry)} />
                      </span>

                      <span className="line-clamp-1 text-[12px] leading-relaxed text-[color:var(--text-muted)] [overflow-wrap:anywhere]">
                        {agent.description?.trim() || 'No description published.'}
                      </span>

                      <span className="text-[11px] text-[color:var(--text-faint)]">
                        {uptime === null
                          ? 'Never probed by Pokter'
                          : `${uptime.toFixed(1)}% of ${record.totalProbes} probes answered`}
                        {listing.attestationCount > 0 &&
                          ` · ${listing.attestationCount} attestation${listing.attestationCount === 1 ? '' : 's'}`}
                      </span>
                    </span>

                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="tabular text-[17px] font-semibold leading-none">
                        {uptime === null ? '—' : `${uptime.toFixed(0)}%`}
                      </span>
                      <span className="text-[10px] text-[color:var(--text-faint)]">
                        answered
                      </span>
                      <span className="tabular mt-1 text-[11px] text-[color:var(--text-muted)]">
                        {listing.quote
                          ? `${formatQuotedPrice(listing.quote.priceU)}/task`
                          : 'No price'}
                      </span>
                    </span>

                    <span
                      aria-hidden
                      className="hidden shrink-0 text-[color:var(--text-faint)] transition-transform group-hover:translate-x-0.5 sm:block"
                    >
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border)] pt-3 text-[12px]">
          <Link
            href="/discover"
            className="text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
          >
            ← Ask a different question
          </Link>
          <a
            href="#explore"
            className="text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
          >
            Browse all agents below
          </a>
        </div>
      </div>
    </section>
  );
}
