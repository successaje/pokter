'use client';

import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { formatScore } from '@/lib/ui/format';
import { DIMENSION_LABELS, type PokterScore } from '@/lib/score/types';
import { ScoreRing } from './ScoreRing';

function scoreColor(overall: number | null): string {
  if (overall === null) return 'var(--text-muted)';
  if (overall >= 80) return 'var(--positive)';
  if (overall >= 55) return 'var(--caution)';
  return 'var(--negative)';
}

/** Compact score for cards and tables. */
export function ScoreBadge({
  score,
  className,
}: {
  score: PokterScore;
  className?: string;
}) {
  return (
    <span className={cn('flex flex-col items-end leading-none', className)}>
      <span
        className="tabular text-xl font-medium"
        style={{ color: scoreColor(score.overall) }}
      >
        {formatScore(score.overall)}
      </span>
      <span className="mt-1 text-[10px] text-[color:var(--text-faint)]">
        {score.measuredDimensions}/{score.totalDimensions} measured
      </span>
    </span>
  );
}

/**
 * §22. The full breakdown.
 *
 * The score is never shown as a bare number here — the dimensions that produced
 * it, and the ones that could not be measured, are one click away. An
 * unexplained score is exactly the kind of authority this product exists to
 * argue against.
 */
export function ScorePanel({
  score,
  label = 'Pokter Score',
}: {
  score: PokterScore;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-[color:var(--surface-hover)]"
      >
        {/*
          A single column rather than two facing each other. The panel also
          lives in a 280px rail, where a ring plus two competing text columns
          left "out of 100" and "of 5 dimensions" both wrapping mid-phrase.
        */}
        <div className="flex items-center gap-3.5">
          <ScoreRing score={score} size={48} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-[color:var(--text-muted)]">{label}</span>
            {/*
              The denominator stays in text beside the ring. An arc shows a
              proportion but never says of what, and "67" on its own invites
              the reader to supply their own scale.
            */}
            <span className="text-[13px] text-[color:var(--text-secondary)]">
              out of 100 · {score.measuredDimensions} of {score.totalDimensions}{' '}
              dimensions
            </span>
          </div>
        </div>

        <span className="text-[11px] text-[color:var(--text-faint)]">
          {expanded ? 'Hide breakdown' : 'Show breakdown'} · v{score.version}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
          {score.dimensions.map((dimension) => {
            const unmeasured = dimension.earned === null;
            return (
              <div key={dimension.dimension} className="flex flex-col gap-2 p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs font-medium">
                    {DIMENSION_LABELS[dimension.dimension]}
                  </span>
                  <span
                    className={cn(
                      'tabular text-xs',
                      unmeasured
                        ? 'text-[color:var(--text-faint)]'
                        : 'text-[color:var(--text)]',
                    )}
                  >
                    {unmeasured
                      ? 'Not measured'
                      : `${Math.round(dimension.earned as number)}/${dimension.weight}`}
                  </span>
                </div>

                {!unmeasured && (
                  <div
                    className="h-1 overflow-hidden rounded-full bg-[color:var(--surface-raised)]"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${((dimension.earned as number) / dimension.weight) * 100}%`,
                        background: scoreColor(
                          ((dimension.earned as number) / dimension.weight) * 100,
                        ),
                      }}
                    />
                  </div>
                )}

                <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                  {dimension.explanation}
                </p>

                {dimension.inputs.length > 0 && (
                  <dl className="flex flex-col gap-1 pt-1">
                    {dimension.inputs.map((input) => (
                      <div
                        key={input.label}
                        className="flex items-baseline justify-between gap-3 text-[11px]"
                      >
                        <dt className="text-[color:var(--text-faint)]">{input.label}</dt>
                        <dd className="mono text-right text-[color:var(--text-secondary)]">
                          {input.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
