'use client';

import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { buttonClass } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { COMPARE_MAX, useCompare } from './store';

export function CompareToggle({ agentKey, className }: { agentKey: string; className?: string }) {
  const compare = useCompare();
  const selected = compare.has(agentKey);
  const disabled = !selected && compare.full;
  return (
    <button
      type="button"
      onClick={() => compare.toggle(agentKey)}
      disabled={disabled}
      aria-pressed={selected}
      title={disabled ? `Compare holds up to ${COMPARE_MAX} agents` : undefined}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-40',
        selected ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink hover:text-ink',
        className,
      )}
    >
      {selected ? <Icon.Check size={14} /> : <Icon.Columns size={14} />}
      {selected ? 'Comparing' : 'Compare'}
    </button>
  );
}

/** Floats above the content once two or more agents are picked. */
export function CompareTray() {
  const compare = useCompare();
  if (compare.keys.length === 0) return null;
  const ready = compare.keys.length >= 2;
  return (
    <div className="anim-rise fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6">
      <div className="flex w-full max-w-md items-center gap-3 rounded-[14px] border border-rule bg-raised px-4 py-3 shadow-float">
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: COMPARE_MAX }, (_, i) => (
            <span key={i} className={cn('size-2 rounded-[2px]', i < compare.keys.length ? 'bg-signal' : 'bg-rule-strong')} />
          ))}
        </span>
        <span className="flex-1 text-sm">
          {compare.keys.length} of {COMPARE_MAX} selected
          {!ready && <span className="block text-[12px] text-ink-3">Pick one more to compare</span>}
        </span>
        <button type="button" onClick={compare.clear} className="text-[13px] text-ink-3 hover:text-ink">
          Clear
        </button>
        <Link
          href={`/compare?agents=${compare.keys.join(',')}`}
          aria-disabled={!ready}
          className={cn(buttonClass('primary', 's'), !ready && 'pointer-events-none opacity-40')}
        >
          Compare
        </Link>
      </div>
    </div>
  );
}
