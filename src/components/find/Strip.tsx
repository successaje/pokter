import type { StripCell } from '@/lib/history/strip';
import { cn } from '@/lib/ui/cn';

function tone(ratio: number): string {
  if (ratio >= 0.97) return 'bg-positive';
  if (ratio >= 0.5) return 'bg-caution';
  return 'bg-negative';
}

/** The record as cells, one per day, ending today. Absence is hatched, never coloured. */
export function Strip({ cells, size = 'sm', className }: { cells: StripCell[]; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const cell = size === 'lg' ? 'h-6 w-2.5 rounded-[3px]' : size === 'md' ? 'h-4 w-2 rounded-[2px]' : 'h-3 w-1.5 rounded-[2px]';
  const answered = cells.reduce((sum, c) => sum + c.answered, 0);
  const probes = cells.reduce((sum, c) => sum + c.probes, 0);
  return (
    <ol className={cn('flex items-center gap-px', className)} role="img" aria-label={probes ? `${answered} of ${probes} checks answered in the last ${cells.length} days` : `No checks in the last ${cells.length} days`}>
      {cells.map((c) => (
        <li key={c.date} title={c.probes ? `${c.date}: ${c.answered} of ${c.probes} answered` : `${c.date}: not checked`} className={cn(cell, c.ratio === null ? 'strip-absent' : tone(c.ratio))} />
      ))}
    </ol>
  );
}
