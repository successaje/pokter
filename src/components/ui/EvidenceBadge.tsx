import { cn } from '@/lib/ui/cn';
import type { Verdict } from '@/lib/proof/engine';

/**
 * §24. The four evidence states, rendered identically everywhere they appear so
 * the vocabulary stays stable across the product.
 */
const STATES: Record<Verdict, { label: string; className: string }> = {
  proven: {
    label: 'Proven',
    className:
      'border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] text-[color:var(--positive)]',
  },
  emerging: {
    label: 'Emerging',
    className:
      'border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] text-[color:var(--caution)]',
  },
  failing: {
    label: 'Failing',
    className:
      'border-[color:var(--negative)]/35 bg-[color:var(--negative-dim)] text-[color:var(--negative)]',
  },
  unproven: {
    label: 'Unproven',
    className:
      'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] text-[color:var(--text-muted)]',
  },
};

export function EvidenceBadge({
  verdict,
  size = 'sm',
  className,
}: {
  verdict: Verdict;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const state = STATES[verdict];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium',
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]',
        state.className,
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {state.label}
    </span>
  );
}
