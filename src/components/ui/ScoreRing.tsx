import { cn } from '@/lib/ui/cn';
import { formatScore } from '@/lib/ui/format';
import type { PokterScore } from '@/lib/score/types';

function bandColor(overall: number | null): string {
  if (overall === null) return 'var(--text-muted)';
  if (overall >= 80) return 'var(--positive)';
  if (overall >= 55) return 'var(--caution)';
  return 'var(--negative)';
}

/**
 * The score as an arc.
 *
 * The arc encodes one thing — the score out of 100 — and nothing else.
 * Coverage is the other half of this number's meaning and it is deliberately
 * left as words beside the ring rather than folded into the same mark: a
 * reader cannot be expected to separate two quantities from one arc, and
 * getting it wrong here would mean misreading how much of the score is
 * actually backed by data.
 *
 * An unscored agent gets a dashed track and an em dash. Not a zero, and not
 * a full ring in grey — both of those read as a measurement, and the whole
 * point is that no measurement exists.
 */
export function ScoreRing({
  score,
  size = 64,
  className,
}: {
  score: PokterScore;
  size?: number;
  className?: string;
}) {
  const stroke = Math.max(3, Math.round(size / 16));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const measured = score.overall !== null;
  const filled = measured ? (score.overall! / 100) * circumference : 0;

  /*
   * Through formatScore, not the raw value. `overall` is an unrounded float,
   * so the first version of this announced "67.43221690590111 out of 100" to
   * a screen reader while the ring showed 67 — the same number said two ways,
   * and the spoken one implying a precision the score does not have.
   */
  const label = measured
    ? `Evidence score ${formatScore(score.overall)} out of 100, scored on ${score.measuredDimensions} of ${score.totalDimensions} dimensions.`
    : 'Not scored: no dimension could be measured.';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className={cn('shrink-0', className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
        /* Dashed when there is nothing to fill it with. */
        strokeDasharray={measured ? undefined : '3 4'}
      />
      {measured && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bandColor(score.overall)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          /* Start at twelve o'clock rather than three. */
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="tabular"
        fill="var(--text)"
        fontSize={Math.round(size * 0.32)}
        fontWeight={500}
      >
        {formatScore(score.overall)}
      </text>
    </svg>
  );
}
