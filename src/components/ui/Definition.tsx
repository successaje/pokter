import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

export interface DefinitionItem {
  term: ReactNode;
  detail: ReactNode;
  /** A second line under the detail, quieter. */
  note?: ReactNode;
}

/**
 * Term and detail, aligned. The way a receipt, a summary or a spec reads:
 * label on the left in a fixed column, value on the right, numbers tabular.
 */
export function DefinitionList({ items, columns = 1, dense = false, className }: { items: DefinitionItem[]; columns?: 1 | 2; dense?: boolean; className?: string }) {
  return (
    <dl className={cn('grid gap-x-8', columns === 2 ? 'sm:grid-cols-2' : '', dense ? 'gap-y-1.5' : 'gap-y-3', className)}>
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] items-baseline gap-x-4 text-body-s">
          <dt className="text-ink-muted">{item.term}</dt>
          <dd className="min-w-0 break-words text-ink [overflow-wrap:anywhere]">
            {item.detail}
            {item.note && <span className="block text-small text-ink-faint">{item.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
