import type { Verdict } from '@/lib/proof/engine';
import { VERDICT_LABEL } from '@/lib/proof/engine';

const STYLES: Record<Verdict, string> = {
  proven: 'border-[color:var(--proven)]/40 bg-[color:var(--proven)]/10 text-[color:var(--proven)]',
  emerging:
    'border-[color:var(--emerging)]/40 bg-[color:var(--emerging)]/10 text-[color:var(--emerging)]',
  failing:
    'border-[color:var(--failing)]/40 bg-[color:var(--failing)]/10 text-[color:var(--failing)]',
  unproven:
    'border-[color:var(--unproven)]/35 bg-[color:var(--unproven)]/10 text-[color:var(--unproven)]',
};

export function VerdictBadge({
  verdict,
  score,
  size = 'sm',
}: {
  verdict: Verdict;
  score?: number | null;
  size?: 'sm' | 'lg';
}) {
  const dimensions =
    size === 'lg' ? 'text-sm px-3 py-1.5 gap-2' : 'text-[11px] px-2 py-0.5 gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium tracking-wide ${dimensions} ${STYLES[verdict]}`}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current"
        style={{ opacity: verdict === 'unproven' ? 0.6 : 1 }}
      />
      {VERDICT_LABEL[verdict]}
      {score !== null && score !== undefined && (
        <span className="tabular opacity-80">{(score * 100).toFixed(0)}%</span>
      )}
    </span>
  );
}
