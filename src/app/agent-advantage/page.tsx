import { cn } from '@/lib/ui/cn';
import {
  AGENT_UNDER_TEST,
  ANNUALISATION_TRAP,
  EXPERIMENTS,
  MEASURED_AT,
  type Winner,
} from '@/lib/experiments/agent-advantage';

export const metadata = {
  title: 'Agent Advantage — Pokter',
  description:
    'Measured comparisons of hiring an agent versus doing the job yourself, against live BNB Chain state.',
};

const WINNER_STYLE: Record<Winner, { label: string; className: string }> = {
  agent: {
    label: 'Agent',
    className:
      'border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] text-[color:var(--positive)]',
  },
  manual: {
    label: 'Manual',
    className:
      'border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] text-[color:var(--caution)]',
  },
  tie: {
    label: 'Draw',
    className: 'border-[color:var(--border-strong)] text-[color:var(--text-muted)]',
  },
};

function Side({
  label,
  ms,
  output,
  note,
  won,
}: {
  label: string;
  ms: number;
  output: string;
  note: string;
  won: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[var(--radius)] border p-4',
        won
          ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)]'
          : 'border-[color:var(--border)] bg-[color:var(--surface)]',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
          {label}
        </span>
        <span className="tabular text-lg leading-none">
          {(ms / 1000).toFixed(2)}s
        </span>
      </div>
      <p className="mono text-[11px] leading-relaxed text-[color:var(--text)]">
        {output}
      </p>
      <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
        {note}
      </p>
    </div>
  );
}

/**
 * §37. The Agent Advantage report, as a product surface.
 *
 * Reads from the same module the written report does, so the page cannot claim
 * a number the experiments did not produce. It leads with the result that
 * undercuts the premise — one task the agent lost — because a comparison that
 * only ever favours the thing being sold is not a measurement.
 */
export default function AgentAdvantagePage() {
  const agentWins = EXPERIMENTS.filter((e) => e.winner === 'agent').length;

  return (
    <div className="flex flex-col gap-12 pt-6">
      <header className="flex max-w-3xl flex-col gap-4">
        <h1 className="display text-3xl sm:text-4xl">
          Does an agent actually beat doing it yourself?
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Three tasks, each run twice against live BNB Chain state on{' '}
          {MEASURED_AT}: once through a live third-party agent, once from
          primary sources with no agent involved. The agent won{' '}
          {agentWins} of {EXPERIMENTS.length} — and the one it lost is the more
          useful result.
        </p>

        <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-[11px]">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[color:var(--text-faint)]">Agent under test</dt>
            <dd>{AGENT_UNDER_TEST.name}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[color:var(--text-faint)]">ERC-8004 ids</dt>
            <dd className="mono">{AGENT_UNDER_TEST.agentIds}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[color:var(--text-faint)]">Availability</dt>
            <dd>{AGENT_UNDER_TEST.availability}</dd>
          </div>
        </dl>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium tracking-tight">
          The finding: it wins on correctness, not speed
        </h2>
        <div className="max-w-3xl rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5">
          <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
            Venus publishes a <em>per-block</em> rate. Annualising it needs a
            blocks-per-year constant, and the figure in most documentation
            assumes BSC&apos;s original three-second blocks. It no longer
            produces them.
          </p>

          <dl className="mt-4 grid gap-px overflow-hidden rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--border)] sm:grid-cols-3">
            {[
              {
                label: 'Measured blocks/year',
                value: ANNUALISATION_TRAP.measuredBlocksPerYear.toLocaleString(),
                sub: `${ANNUALISATION_TRAP.measuredBlockSeconds}s blocks, read from chain`,
              },
              {
                label: 'Published constant',
                value: ANNUALISATION_TRAP.legacyBlocksPerYear.toLocaleString(),
                sub: 'assumes 3s blocks',
              },
              {
                label: 'Resulting error',
                value: ANNUALISATION_TRAP.factor,
                sub: `${ANNUALISATION_TRAP.legacyApr} instead of ${ANNUALISATION_TRAP.correctApr}`,
              },
            ].map((cell) => (
              <div key={cell.label} className="flex flex-col gap-1 bg-[color:var(--surface)] p-3">
                <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  {cell.label}
                </dt>
                <dd className="tabular text-lg leading-none">{cell.value}</dd>
                <dd className="text-[10px] text-[color:var(--text-faint)]">{cell.sub}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-sm leading-relaxed text-[color:var(--text-secondary)]">
            An analyst copying the published constant computes{' '}
            <span className="mono">{ANNUALISATION_TRAP.legacyApr}</span> where the
            true figure is{' '}
            <span className="mono">{ANNUALISATION_TRAP.correctApr}</span> — no
            error, no warning, just a number wrong enough to make a profitable
            position look not worth entering. The agent answered{' '}
            <span className="mono">{ANNUALISATION_TRAP.agentAnswer}</span>.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-lg font-medium tracking-tight">The experiments</h2>

        {EXPERIMENTS.map((experiment) => (
          <article
            key={experiment.id}
            className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5"
          >
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  {experiment.category}
                  {experiment.requiredCategory &&
                    ` · satisfies the ${experiment.requiredCategory} requirement`}
                </span>
                <h3 className="text-base font-medium">{experiment.title}</h3>
                <p className="max-w-2xl text-xs leading-relaxed text-[color:var(--text-muted)]">
                  {experiment.question}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                  WINNER_STYLE[experiment.winner].className,
                )}
              >
                {WINNER_STYLE[experiment.winner].label} wins
              </span>
            </header>

            <div className="grid gap-3 sm:grid-cols-2">
              <Side
                label="Agent"
                ms={experiment.agent.ms}
                output={experiment.agent.output}
                note={experiment.agent.note}
                won={experiment.winner === 'agent'}
              />
              <Side
                label="Manual"
                ms={experiment.manual.ms}
                output={experiment.manual.output}
                note={experiment.manual.note}
                won={experiment.winner === 'manual'}
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-3">
              <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                <span className="font-medium text-[color:var(--text-secondary)]">
                  Quality:
                </span>{' '}
                {experiment.quality}
              </p>
              <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                <span className="font-medium text-[color:var(--text-secondary)]">
                  Verdict:
                </span>{' '}
                {experiment.verdict}
              </p>
            </div>
          </article>
        ))}
      </section>

      <section className="flex max-w-3xl flex-col gap-3">
        <h2 className="text-lg font-medium tracking-tight">
          How this was measured
        </h2>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Agent calls are plain JSON-RPC against a read-only MCP server; no funds
          moved. The manual baseline reads the Venus Comptroller and per-market
          rate accessors directly.
        </p>
        <p className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          <span className="font-medium text-[color:var(--text-secondary)]">
            On &ldquo;manual time&rdquo;:
          </span>{' '}
          the baseline was performed by an AI assistant working from primary
          sources, not by a human analyst. The timings are real wall-clock
          measurements, but they are machine-to-machine — a person would be
          slower on the manual side, so where manual loses it loses by more than
          shown. We would rather name that limit than invent a human figure to
          fill the column.
        </p>
      </section>
    </div>
  );
}
