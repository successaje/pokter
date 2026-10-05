import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/** A measured figure with its label beneath and, optionally, where it came from. */
export function Stat({ value, label, note, size = 'md', className }: { value: ReactNode; label: ReactNode; note?: ReactNode; size?: 'md' | 'lg'; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className={cn('tabular font-semibold tracking-tight text-ink', size === 'lg' ? 'text-display' : 'text-page')}>{value}</span>
      <span className="text-small text-ink-muted">{label}</span>
      {note && <span className="text-caption text-ink-faint">{note}</span>}
    </div>
  );
}
