'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { cn } from '@/lib/ui/cn';
import type { Verdict } from '@/lib/proof/engine';

export interface ListingRow {
  key: string;
  href: string;
  hireHref: string | null;
  name: string;
  imageUrl: string | null;
  categoryLabel: string;
  description: string;
  verdict: Verdict;
  observed: string;
  receipts: number;
}

type View = 'grid' | 'list';
const STORAGE_KEY = 'pokter:marketplace-view';

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/**
 * Grid or list, the reader's choice.
 *
 * They answer different questions. A grid is for browsing when you do not yet
 * know what you want; a list puts the same agents in one column with their
 * numbers aligned, which is what you need once you are comparing rather than
 * discovering. Neither is the better default for everyone, so the control is
 * offered rather than decided.
 *
 * The choice is kept in localStorage because it is a preference about reading,
 * not a fact about the marketplace: it belongs to this browser, never needs to
 * reach the server, and losing it costs one click.
 */
/*
 * Read through useSyncExternalStore rather than an effect.
 *
 * localStorage is not React state, and setting state from an effect to mirror
 * it renders the wrong layout first and corrects it a frame later. This gives
 * the server a defined snapshot — grid — and lets the client read the real
 * value during hydration instead of after it.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  /*
   * Another tab changing the choice must beat the in-memory copy, or the two
   * tabs disagree until this one is reloaded.
   */
  const fromOtherTab = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    current = event.newValue === 'list' ? 'list' : 'grid';
    listener();
  };
  window.addEventListener('storage', fromOtherTab);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', fromOtherTab);
  };
}

/*
 * Held in memory as well as in storage.
 *
 * A private window throws on setItem, and reading storage back would then
 * return the previous value — leaving the button pressed and the layout
 * unchanged. The choice has to survive for this session even where it cannot
 * survive the tab closing.
 */
let current: View | null = null;

function readView(): View {
  if (current !== null) return current;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function writeView(next: View) {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Remembering it across visits is the part that fails, not honouring it.
  }
  for (const listener of listeners) listener();
}

export function MarketplaceListing({ rows }: { rows: ListingRow[] }) {
  const view = useSyncExternalStore(subscribe, readView, () => 'grid' as View);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-[color:var(--text-faint)]">
          <span className="tabular">{rows.length}</span> shown
        </p>

        <div
          role="group"
          aria-label="Layout"
          className="flex overflow-hidden rounded-[var(--radius)] border border-[color:var(--border-strong)]"
        >
          {([
            ['grid', 'Grid', <GridIcon key="g" />],
            ['list', 'List', <ListIcon key="l" />],
          ] as const).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => writeView(value)}
              aria-pressed={view === value}
              aria-label={`${label} view`}
              className={cn(
                'tap-safe flex size-9 items-center justify-center transition-colors',
                view === value
                  ? 'bg-[color:var(--brand)] text-[color:var(--brand-ink)]'
                  : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)]',
              )}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {view === 'grid' ? (
        /*
          Three across rather than four. At four the cards were narrow enough
          that names wrapped to two lines and descriptions clipped mid-word,
          so the density bought nothing a reader could use.
        */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <article
              key={row.key}
              className="group flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[color:var(--border-strong)] hover:shadow-[0_12px_35px_rgba(0,0,0,0.08)]"
            >
              <Link href={row.href} className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <AgentAvatar name={row.name} src={row.imageUrl} size="lg" />
                  <EvidenceBadge verdict={row.verdict} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-faint)]">
                    {row.categoryLabel}
                  </p>
                  <h3 title={row.name} className="mt-1 line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
                    {row.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                    {row.description}
                  </p>
                </div>
                <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-[color:var(--border)] pt-3">
                  <div>
                    <dt className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">Observed</dt>
                    <dd className="tabular mt-0.5 text-[11px] font-medium">{row.observed}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">Receipts</dt>
                    <dd className="tabular mt-0.5 text-[11px] font-medium">{row.receipts}</dd>
                  </div>
                </dl>
              </Link>
              <div className="flex items-center gap-2 border-t border-[color:var(--border)] px-4 py-3">
                <Link href={row.href} className="tap flex flex-1 items-center text-[11px] font-medium text-[color:var(--text-secondary)] md:min-h-9">
                  Review evidence
                </Link>
                {row.hireHref && (
                  <Link href={row.hireHref} className="action-primary tap inline-flex items-center rounded-[var(--radius)] px-3 text-[11px] font-semibold md:min-h-9">
                    Hire
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        /*
          One column, numbers in the same place on every row. This is the view
          for deciding between agents rather than meeting them, so the figures
          line up and the description gets one line instead of two.
        */
        <ul className="flex flex-col divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-col gap-3 p-4 transition-colors hover:bg-[color:var(--surface-hover)] sm:flex-row sm:items-center sm:gap-4"
            >
              <Link href={row.href} className="flex min-w-0 flex-1 items-start gap-3">
                <AgentAvatar name={row.name} src={row.imageUrl} size="sm" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold [overflow-wrap:anywhere]">
                      {row.name}
                    </span>
                    <EvidenceBadge verdict={row.verdict} />
                  </span>
                  <span className="text-[11px] text-[color:var(--text-faint)]">
                    {row.categoryLabel}
                  </span>
                  <span className="line-clamp-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                    {row.description}
                  </span>
                </span>
              </Link>

              <dl className="flex shrink-0 gap-5 sm:w-56">
                <div className="min-w-0">
                  <dt className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">Observed</dt>
                  <dd className="tabular mt-0.5 truncate text-[11px] font-medium">{row.observed}</dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">Receipts</dt>
                  <dd className="tabular mt-0.5 text-[11px] font-medium">{row.receipts}</dd>
                </div>
              </dl>

              <div className="flex shrink-0 items-center gap-2">
                <Link href={row.href} className="tap inline-flex items-center rounded-[var(--radius)] border border-[color:var(--border)] px-3 text-[11px] font-medium md:min-h-9">
                  Review
                </Link>
                {row.hireHref && (
                  <Link href={row.hireHref} className="action-primary tap inline-flex items-center rounded-[var(--radius)] px-3 text-[11px] font-semibold md:min-h-9">
                    Hire
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
