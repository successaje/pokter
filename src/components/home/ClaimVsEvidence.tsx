import Link from 'next/link';

import { formatPercent } from '@/lib/ui/format';
import type { Comparison } from '@/lib/marketplace';

/**
 * The argument, made with a real agent instead of a slogan.
 *
 * The exhibit is fetched live from the registry, so it cannot become a stale
 * illustration of a claim that stopped being true. If this agent ever starts
 * answering its probes, the section stops accusing it — which is the honest
 * behaviour, and the reason it reads from the same evidence pipeline as
 * everything else rather than from a hardcoded example.
 */
export function ClaimVsEvidence({ exhibit }: { exhibit: Comparison | null }) {
  if (!exhibit) return null;

  const { agent, record, proof } = exhibit;
  const uptime =
    record.totalProbes === 0 ? null : record.totalAnswered / record.totalProbes;

  // The section only makes its point with an agent that pitches well and
  // measures badly. Anything else would be an unfair exhibit.
  if (uptime === null || uptime > 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          The problem
        </p>
        <h2 className="display text-2xl sm:text-4xl">
          Don&apos;t trust the pitch.{' '}
          <span className="swash">Check the track record.</span>
        </h2>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          This is a real agent in the BNB Chain registry, read live as you loaded
          this page. Its description is specific, technical and entirely
          plausible. Its endpoint has not answered a single one of our probes.
        </p>
      </div>

      <div className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--border-strong)] lg:grid-cols-2">
        {/* The claim, presented the way a directory would present it. */}
        <article className="flex flex-col gap-4 bg-[color:var(--surface)] p-6">
          <header className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-widest text-[color:var(--text-faint)]">
              What it says
            </span>
            <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] text-[color:var(--text-faint)]">
              self-declared
            </span>
          </header>

          <h3 className="text-lg font-medium leading-snug">{agent.name}</h3>

          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            {agent.description?.slice(0, 320)}
            {(agent.description?.length ?? 0) > 320 && '…'}
          </p>

          <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-[color:var(--border)] pt-4 text-[11px]">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[color:var(--text-faint)]">Registered</dt>
              <dd>ERC-8004, chain {agent.chain_id}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[color:var(--text-faint)]">Publishes</dt>
              <dd>{(agent.supported_protocols ?? []).join(', ') || 'an endpoint'}</dd>
            </div>
          </dl>
        </article>

        {/* What checking it actually found. */}
        <article className="relative flex flex-col gap-4 bg-[color:var(--negative-dim)] p-6">
          <header className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-widest text-[color:var(--negative)]">
              What we measured
            </span>
            <span className="rounded-full border border-[color:var(--negative)]/40 px-2 py-0.5 text-[10px] font-medium text-[color:var(--negative)]">
              {proof.verdict}
            </span>
          </header>

          <p className="tabular text-4xl font-medium leading-none text-[color:var(--negative)] sm:text-5xl">
            {formatPercent(uptime, { decimals: 0 })}
          </p>

          {/*
            One mark per probe actually taken. Staggered so the failures land in
            sequence rather than all at once — the point is that this was
            checked repeatedly over time, not judged in a single glance.
          */}
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label={`${record.totalAnswered} of ${record.totalProbes} probes answered`}
          >
            {Array.from({ length: Math.min(record.totalProbes, 40) }).map(
              (_, index) => (
                <li
                  key={index}
                  aria-hidden
                  style={{ animationDelay: `${index * 45}ms` }}
                  className="reveal size-2.5 rounded-[3px] border border-[color:var(--negative)]/45 bg-[color:var(--negative)]/25"
                />
              ),
            )}
          </ul>

          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            {record.totalAnswered} of {record.totalProbes} probes answered. Every
            request Pokter has made to this agent&apos;s declared endpoint has
            failed.
          </p>

          <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-[color:var(--negative)]/25 pt-4 text-[11px]">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[color:var(--text-muted)]">Longest outage</dt>
              <dd className="tabular">
                {record.longestOutage?.probes ?? record.totalProbes} consecutive
                failures
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[color:var(--text-muted)]">Hiring</dt>
              <dd className="font-medium text-[color:var(--negative)]">Blocked</dd>
            </div>
          </dl>
        </article>
      </div>

      <p className="max-w-3xl text-[13px] leading-relaxed text-[color:var(--text-muted)]">
        Nothing here is a judgement about whether this agent is any good. It is a
        statement that nothing about it can currently be verified — and Pokter
        will not hand your wallet to something it cannot check.{' '}
        <Link
          href={`/agents/${agent.chain_id}/${agent.token_id}`}
          className="text-[color:var(--text-secondary)] underline underline-offset-2 hover:text-[color:var(--text)]"
        >
          See the full evidence
        </Link>
        .
      </p>
    </section>
  );
}
