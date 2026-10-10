import { VERDICT_LABEL, VERDICT_MEANING, type Verdict } from '@/lib/proof/engine';
import { cn } from '@/lib/ui/cn';

/*
 * The evidence vocabulary, as marks.
 *
 * Shape carries the meaning as well as colour, so the states survive
 * greyscale and colour-blindness: a filled square for corroborated, a
 * filled circle for consistently answering, a half for intermittent, a ring
 * for "measurement has started", a cross for failing and a dashed ring for
 * "nothing measured", which is a statement about Pokter, not the agent.
 */
export const VERDICT_TONE: Record<Verdict, 'ok' | 'watch' | 'info' | 'bad' | 'none'> = {
  proven: 'ok',
  reliable: 'ok',
  emerging: 'watch',
  observed: 'info',
  failing: 'bad',
  unproven: 'none',
};

const TONE_TEXT = {
  ok: 'text-ok',
  watch: 'text-watch',
  info: 'text-info',
  bad: 'text-bad',
  none: 'text-none',
} as const;

const TONE_WASH = {
  ok: 'bg-ok-wash text-ok',
  watch: 'bg-watch-wash text-watch',
  info: 'bg-info-wash text-info',
  bad: 'bg-bad-wash text-bad',
  none: 'bg-none-wash text-ink-2',
} as const;

export function VerdictGlyph({ verdict, size = 10 }: { verdict: Verdict; size?: number }) {
  const s = size;
  const c = s / 2;
  const r = s / 2 - 1;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden className={cn('shrink-0', TONE_TEXT[VERDICT_TONE[verdict]])}>
      {verdict === 'proven' && <rect x="0.5" y="0.5" width={s - 1} height={s - 1} rx="1.5" fill="currentColor" />}
      {verdict === 'reliable' && <circle cx={c} cy={c} r={r} fill="currentColor" />}
      {verdict === 'emerging' && (
        <>
          <circle cx={c} cy={c} r={r - 0.5} fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d={`M ${c} ${c - r + 0.5} A ${r - 0.5} ${r - 0.5} 0 0 1 ${c} ${c + r - 0.5} Z`} fill="currentColor" />
        </>
      )}
      {verdict === 'observed' && <circle cx={c} cy={c} r={r - 0.5} fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {verdict === 'failing' && (
        <path d={`M1.5 1.5 L${s - 1.5} ${s - 1.5} M${s - 1.5} 1.5 L1.5 ${s - 1.5}`} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      )}
      {verdict === 'unproven' && (
        <circle cx={c} cy={c} r={r - 0.5} fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="1.6 1.6" />
      )}
    </svg>
  );
}

/** The verdict as a quiet inline label: glyph plus word. */
export function VerdictLabel({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium', TONE_TEXT[VERDICT_TONE[verdict]], verdict === 'unproven' && 'text-ink-3', className)} title={VERDICT_MEANING[verdict]}>
      <VerdictGlyph verdict={verdict} />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/** The verdict as a chip, for headers where it needs to stand alone. */
export function VerdictChip({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-7 items-center gap-2 rounded-full px-2.5 text-[13px] font-medium', TONE_WASH[VERDICT_TONE[verdict]], className)}
      title={VERDICT_MEANING[verdict]}
    >
      <VerdictGlyph verdict={verdict} />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export { VERDICT_LABEL, VERDICT_MEANING };
