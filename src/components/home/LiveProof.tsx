import { formatMs } from '@/lib/ui/format';
import type { ProbeLine } from '@/lib/hero/pipeline';

/**
 * The check itself, rather than a description of it.
 *
 * These are transcripts of the last probes Pokter took — the latency and the
 * response text are what those endpoints actually returned, including the ones
 * that returned nothing useful. Showing only the successes would make this a
 * marketing panel; the failures are the reason anyone should believe the
 * successes.
 */
export function LiveProof({ probes }: { probes: ProbeLine[] }) {
  if (probes.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          Live proof
        </p>
        <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
          This is what checking an agent looks like.
        </h2>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          The last probes Pokter took, verbatim. A probe counts as answered only
          when the endpoint returns well-formed JSON — an HTTP 200 from a proxy
          is not an answer.
        </p>
      </div>

      <ol className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)]">
        {probes.map((probe, index) => (
          <li
            key={`${probe.at}-${index}`}
            style={{ animationDelay: `${index * 130}ms` }}
            className="reveal flex items-center gap-3 border-b border-[color:var(--border)] px-4 py-2.5 last:border-b-0"
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{
                background: probe.ok ? 'var(--positive)' : 'var(--negative)',
              }}
            />
            <span
              className="mono w-16 shrink-0 text-[11px]"
              style={{
                color: probe.ok ? 'var(--positive)' : 'var(--negative)',
              }}
            >
              {probe.ok ? 'ANSWER' : 'FAIL'}
            </span>
            <span className="mono w-16 shrink-0 text-[11px] text-[color:var(--text-muted)]">
              {formatMs(probe.latencyMs)}
            </span>
            <span className="truncate text-[11px] text-[color:var(--text-secondary)]">
              {probe.detail}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
