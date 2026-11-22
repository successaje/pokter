import type { ReactNode } from 'react';

import { FIELD_CELL, FIELD_COLS, FIELD_ROWS, heroFieldCells } from '@/lib/landing/hero-field';
import { cn } from '@/lib/ui/cn';
import { PointerGrid } from '@/ui/PointerGrid';

/*
 * The landing page's sheet: the pieces every section is cut from.
 *
 * The page is set like a ruled sheet rather than a stack of cards. The
 * frame's edges run its length as hairlines (`SheetRails`), sections are cut
 * across it by full-width rules pinned to those edges with a registration
 * cross (`SheetRule`), and anything left blank shows graph paper. It is the
 * site's own measuring motif — the ruler under the record, the ticks in the
 * footer — taken from decoration into the layout itself.
 */

/** The frame's two edges, the full height of whatever holds them. Desktop only. */
export function SheetRails() {
  return <div aria-hidden className="sheet-rails hidden lg:block" />;
}

/** A full-width rule with a cross where it meets each edge of the frame. */
export function SheetRule({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative border-t border-rule', className)}>
      <div className="frame relative hidden lg:block">
        <span className="sheet-cross" style={{ left: 0 }} />
        <span className="sheet-cross" style={{ left: '100%' }} />
      </div>
    </div>
  );
}

/*
 * A rule marked off in segments: ink, signal, paper showing through. Each
 * segment draws itself in from the left as it scrolls into view, where the
 * browser can tie an animation to scroll; elsewhere it is simply drawn.
 */
const SEGMENTS: Array<[number, string]> = [
  [14, 'bg-ink'],
  [9, 'bg-signal'],
  [21, 'bg-rule-strong'],
  [6, 'bg-signal'],
  [18, 'bg-ink'],
  [12, 'bg-rule-strong'],
  [8, 'bg-signal'],
  [12, 'bg-ink'],
];

export function SignalRule({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('signal-rule flex h-[2px] w-full gap-px', className)}>
      {SEGMENTS.map(([grow, tone], i) => (
        <span key={i} className={tone} style={{ flexGrow: grow, flexBasis: 0 }} />
      ))}
    </div>
  );
}

/** A section's label, heading and lede, set the same way everywhere on the page. */
export function SectionHead({
  label,
  id,
  title,
  aside,
  children,
  align = 'start',
  className,
}: {
  label: string;
  id: string;
  title: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'sm:flex-row sm:items-end sm:justify-between sm:gap-10',
        className,
      )}
    >
      <div className={cn('flex max-w-[40rem] flex-col gap-3.5', align === 'center' && 'items-center')}>
        <span className="t-label inline-flex items-center gap-2">
          <span aria-hidden className="size-[7px] bg-signal" />
          {label}
        </span>
        <h2 id={id} className="t-h1">
          {title}
        </h2>
        {children}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

/*
 * The hero's field: graph paper, and here and there a cell lighting up the
 * way a call goes out. Most flash and go dark; a few hold, in the signal
 * colour. Which cells, and how, is `hero-field.ts`; this only draws them.
 *
 * Over it, the pointer grid: the lattice shows through round the pointer
 * even behind the words, the squares it crosses light and fade, and one it
 * rests on answers. Aligned to the same 24px lattice, so a lit square sits
 * in a square of the paper.
 */
const FIELD = heroFieldCells();

export function HeroField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
      <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ width: FIELD_COLS * FIELD_CELL + 1, height: FIELD_ROWS * FIELD_CELL + 1 }}>
        <div className="graph-paper absolute inset-0 [mask-image:radial-gradient(ellipse_58%_56%_at_50%_42%,transparent_46%,black_86%)]">
        {FIELD.map((cell) => (
          <span
            key={`${cell.col}:${cell.row}`}
            className={cn('call-cell', cell.answered ? 'bg-signal/75' : 'bg-ink/[0.08]')}
            data-answered={cell.answered || undefined}
            style={{
              left: cell.col * FIELD_CELL + 1,
              top: cell.row * FIELD_CELL + 1,
              ['--d' as string]: `${cell.duration.toFixed(2)}s`,
              ['--o' as string]: `${cell.offset.toFixed(2)}s`,
            }}
          />
        ))}
        </div>
        <PointerGrid cell={FIELD_CELL} />
      </div>
    </div>
  );
}
