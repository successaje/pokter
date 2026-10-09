'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { CATEGORIES, type Category } from '@/lib/agents/categories';
import type { FindRow } from '@/lib/find/rows';
import { VERDICT_LABEL, VERDICT_MEANING } from '@/lib/proof/engine';
import { cn } from '@/lib/ui/cn';
import { suggestionLabel, suggestionNote } from '@/lib/find/suggested';
import { formatMs } from '@/lib/ui/format';
import { plural } from '@/lib/ui/plural';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Status } from '@/components/ui/Status';
import { Drawer } from '@/components/ui/Drawer';
import { DefinitionList } from '@/components/ui/Definition';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { Strip } from './Strip';
import { AgentSpotlight } from './AgentSpotlight';

type Segment = 'hirable' | 'answering' | 'all';
type Sort = 'recommended' | 'answering' | 'price' | 'evidence' | 'completed';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'answering', label: 'Answering most' },
  { value: 'price', label: 'Lowest signed price' },
  { value: 'evidence', label: 'Most checks' },
  { value: 'completed', label: 'Most paid work' },
];

const VERDICT_TONE = { proven: 'positive', reliable: 'positive', emerging: 'caution', observed: 'info', failing: 'negative', unproven: 'neutral' } as const;

function percent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function matches(row: FindRow, text: string): boolean {
  if (!text) return true;
  const hay = `${row.name} ${row.categoryLabel} ${row.description}`.toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

function sortRows(rows: FindRow[], sort: Sort): FindRow[] {
  const copy = [...rows];
  switch (sort) {
    case 'answering':
      return copy.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.probes - a.probes);
    case 'price':
      return copy.sort((a, b) => (a.priceU ?? Infinity) - (b.priceU ?? Infinity));
    case 'evidence':
      return copy.sort((a, b) => b.probes - a.probes);
    case 'completed':
      return copy.sort((a, b) => b.paid.completed - a.paid.completed || b.probes - a.probes);
    default:
      return copy;
  }
}

/* The two or three lines that describe where an agent stands, shared by the row and the pane. */
function availability(row: FindRow): { tone: 'positive' | 'caution' | 'negative' | 'neutral'; word: string } {
  if (row.probes === 0) return { tone: 'neutral', word: 'Never called' };
  if (row.answeringToday) return { tone: 'positive', word: 'Answering today' };
  if (row.sinceAnswer === null) return { tone: 'negative', word: 'Has never answered' };
  if (row.sinceAnswer === 0) return { tone: 'positive', word: 'Answered today' };
  if (row.sinceAnswer <= 7) return { tone: 'caution', word: `Answered ${plural(row.sinceAnswer, 'day')} ago` };
  return { tone: 'negative', word: `Quiet for ${plural(row.sinceAnswer, 'day')}` };
}

export function FindWorkbench({ rows, unreachable }: { rows: FindRow[]; unreachable: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const deferredQuery = useDeferredValue(query);
  const [segment, setSegment] = useState<Segment>((params.get('show') as Segment) || 'hirable');
  const [category, setCategory] = useState<Category | 'all'>((params.get('category') as Category) || 'all');
  const [sort, setSort] = useState<Sort>((params.get('sort') as Sort) || 'recommended');
  const [selectedKey, setSelectedKey] = useState<string | null>(params.get('a'));
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  /* "Or search all N agents" puts the cursor where the next action is. */
  const searchRef = useRef<HTMLInputElement>(null);

  /*
   * The URL follows the controls, so a view can be shared and the back
   * button means something.
   *
   * The path is written out rather than read from usePathname because this
   * component is the whole of one page; if it is ever mounted on a second
   * address, this is the line that has to be decided deliberately rather
   * than the one that quietly rewrites the visitor's URL to the other page.
   */
  useEffect(() => {
    const next = new URLSearchParams();
    if (deferredQuery.trim()) next.set('q', deferredQuery.trim());
    if (segment !== 'hirable') next.set('show', segment);
    if (category !== 'all') next.set('category', category);
    if (sort !== 'recommended') next.set('sort', sort);
    if (selectedKey) next.set('a', selectedKey);
    const target = `/discover${next.size ? `?${next}` : ''}`;
    if (target !== `${window.location.pathname}${window.location.search}`) router.replace(target, { scroll: false });
  }, [deferredQuery, segment, category, sort, selectedKey, router]);

  const counts = useMemo(
    () => ({
      hirable: rows.filter((row) => row.hirable).length,
      answering: rows.filter((row) => row.answeringToday).length,
      all: rows.length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (row) =>
        (segment === 'all' || (segment === 'hirable' ? row.hirable : row.answeringToday)) &&
        (category === 'all' || row.category === category) &&
        matches(row, deferredQuery),
    );
    return sortRows(filtered, sort);
  }, [rows, segment, category, deferredQuery, sort]);

  /*
   * Untouched means nothing has been asked yet: no words typed, no
   * category, the default segment, and no agent chosen from a shared link.
   * Sort is deliberately not part of it — changing the order of a list you
   * have not filtered is still browsing.
   */
  const untouched =
    !deferredQuery.trim() && category === 'all' && segment === 'hirable' && !selectedKey;

  const selected = visible.find((row) => row.key === selectedKey) ?? visible[0] ?? null;
  const compared = compare.map((key) => rows.find((row) => row.key === key)).filter((row): row is FindRow => Boolean(row));

  function toggleCompare(key: string) {
    setCompare((current) => (current.includes(key) ? current.filter((k) => k !== key) : current.length >= 3 ? current : [...current, key]));
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        Discover before the workbench.

        On arrival this page is a cold table, so the agents come first: one
        pick and a few rails of them. The moment anybody searches, picks a
        category or arrives on a shared link, it is gone and the list is the
        whole page — by then the reader has said what they want and a
        showcase would only sit between them and it.
      */}
      {untouched && (
        <AgentSpotlight
          rows={rows}
          onBrowse={() => searchRef.current?.focus({ preventScroll: false })}
        />
      )}

      {/* ── Controls ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-page">Find an agent</h1>
            <p className="mt-0.5 text-body-s text-ink-muted">
              {plural(rows.length, 'agent')} indexed on BNB Chain, {counts.hirable} ready to hire. Ordered by what has been observed.
            </p>
          </div>
          <label className="flex items-center gap-2 text-small text-ink-muted">
            Sort
            <Select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="h-8 w-auto text-body-s">
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="relative">
          <svg viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 fill-none stroke-ink-faint" strokeWidth="1.8">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.5-4.5" strokeLinecap="round" />
          </svg>
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, protocol or what you need done"
            aria-label="Search agents"
            className="h-10 bg-surface pl-9 text-body"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Segmented
            label="Which agents"
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'hirable', label: 'Ready to hire', short: 'Hireable', detail: counts.hirable },
              { value: 'answering', label: 'Answering today', short: 'Answering', detail: counts.answering },
              { value: 'all', label: 'All', detail: counts.all },
            ]}
            className="w-full sm:w-fit"
          />
          <div role="radiogroup" aria-label="Category" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {[{ id: 'all' as const, label: 'All categories' }, ...CATEGORIES].map((item) => {
              const active = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategory(item.id)}
                  className={cn('tap-safe h-8 whitespace-nowrap rounded-md px-3 text-body-s font-medium transition-colors', active ? 'bg-ink text-canvas' : 'text-ink-muted hover:bg-surface-hover hover:text-ink')}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {compare.length > 0 && (
            <Button size="sm" onClick={() => setCompareOpen(true)} className="ml-auto">
              Compare {compare.length}
            </Button>
          )}
        </div>
      </div>

      {unreachable && (
        <p className="rounded-md border border-caution/40 bg-caution-dim px-3 py-2 text-body-s text-ink-secondary">The registry did not answer just now. This list is the last one Pokter read; records and prices are still live.</p>
      )}

      {/* ── List and pane ─────────────────────────────────────────── */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="Agents" className="min-w-0">
          <div className="hidden grid-cols-[2rem_minmax(0,1fr)_7.5rem_6rem_5.5rem_5rem_2rem] items-center gap-3 px-3 pb-2 text-caption uppercase tracking-wide text-ink-faint lg:grid">
            <span />
            <span>Agent</span>
            <span>Last 14 days</span>
            <span className="text-right">Price</span>
            <span className="text-right">Answers in</span>
            <span className="text-right">Paid</span>
            <span className="sr-only">Compare</span>
          </div>
          {visible.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface px-5 py-10 text-center">
              <p className="text-body font-medium">Nothing matches</p>
              <p className="mt-1 text-body-s text-ink-muted">
                {segment !== 'all' ? 'Try “All” to include agents that are not ready to hire, or ' : 'Try '}
                a shorter search.
              </p>
            </div>
          ) : (
            <ul className="hairline overflow-hidden rounded-lg border border-line bg-surface">
              {visible.map((row) => {
                const isSelected = selected?.key === row.key;
                const where = availability(row);
                return (
                  <li key={row.key} className={cn('relative', isSelected && 'bg-surface-hover lg:before:absolute lg:before:inset-y-0 lg:before:left-0 lg:before:w-0.5 lg:before:bg-ink')}>
                    <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 px-3 py-3 lg:grid-cols-[2rem_minmax(0,1fr)_7.5rem_6rem_5.5rem_5rem_2rem] lg:items-center lg:py-2.5">
                      <AgentAvatar name={row.name} src={row.imageUrl} size="sm" />
                      <div className="min-w-0">
                        {/* Desktop selects the pane; phones open the page. */}
                        <button type="button" onClick={() => setSelectedKey(row.key)} className="hidden min-w-0 text-left lg:block after:absolute after:inset-0 after:content-['']">
                          <span className="block truncate text-body-s font-medium text-ink">{row.name}</span>
                        </button>
                        <Link href={`/agents/${row.chainId}/${row.tokenId}`} className="block min-w-0 lg:hidden after:absolute after:inset-0 after:content-['']">
                          <span className="block truncate text-body-s font-medium text-ink">{row.name}</span>
                        </Link>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-small text-ink-muted">
                          <span>{row.categoryLabel}</span>
                          <span aria-hidden>·</span>
                          <Status tone={where.tone}>{where.word}</Status>
                        </span>
                        <span className="mt-1.5 flex items-center gap-3 lg:hidden">
                          <Strip cells={row.cells} />
                          <span className="tabular text-small text-ink-muted">{percent(row.rate)}</span>
                          <span
                          className={cn('ml-auto tabular text-small', row.priceU !== null ? 'font-medium text-ink' : 'text-ink-muted')}
                          title={row.priceU === null && row.suggested ? suggestionNote(row.suggested, row.categoryLabel) : undefined}
                        >
                          {row.priceU !== null ? row.priceLabel : row.suggested ? suggestionLabel(row.suggested) : 'Set budget'}
                        </span>
                        </span>
                      </div>
                      <div className="hidden items-center gap-2 lg:flex">
                        <Strip cells={row.cells} />
                        <span className="tabular text-small text-ink-muted">{percent(row.rate)}</span>
                      </div>
                      <span
                        className={cn('hidden text-right tabular text-body-s lg:block', row.priceU !== null ? 'font-medium text-ink' : 'text-ink-muted')}
                        title={row.priceU === null && row.suggested ? suggestionNote(row.suggested, row.categoryLabel) : undefined}
                      >
                        {row.priceU !== null ? row.priceLabel : row.suggested ? suggestionLabel(row.suggested) : 'Set budget'}
                      </span>
                      <span className="hidden text-right tabular text-body-s text-ink-secondary lg:block">{row.medianMs === null ? '—' : formatMs(row.medianMs)}</span>
                      <span className={cn('hidden text-right tabular text-body-s lg:block', row.paid.jobs === 0 ? 'text-ink-faint' : row.paid.completed < row.paid.jobs ? 'text-caution' : 'text-ink-secondary')}>
                        {row.paid.jobs === 0 ? '—' : `${row.paid.completed}/${row.paid.jobs}`}
                      </span>
                      <label className="relative z-10 hidden items-center justify-center lg:flex" title="Compare">
                        <input type="checkbox" checked={compare.includes(row.key)} onChange={() => toggleCompare(row.key)} aria-label={`Compare ${row.name}`} className="size-4 accent-[var(--text)]" />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Detail pane ───────────────────────────────────────────── */}
        {selected && (
          <aside aria-label="Selected agent" className="sticky top-[68px] hidden flex-col gap-4 rounded-lg border border-line bg-surface p-5 lg:flex">
            <div className="flex items-start gap-3">
              <AgentAvatar name={selected.name} src={selected.imageUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-body font-semibold" title={selected.name}>
                  {selected.name}
                </h2>
                <p className="text-small text-ink-muted">{selected.categoryLabel}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Status tone={VERDICT_TONE[selected.verdict]}>{VERDICT_LABEL[selected.verdict]}</Status>
              <Status tone={availability(selected).tone} live={selected.answeringToday}>
                {availability(selected).word}
              </Status>
            </div>
            <div className="flex flex-col gap-1.5">
              <Strip cells={selected.cells} size="md" />
              <p className="text-small text-ink-muted">
                {selected.probes ? `${percent(selected.rate)} of ${plural(selected.probes, 'check')} answered.` : 'Pokter has not called this agent yet.'} {VERDICT_MEANING[selected.verdict]}
              </p>
            </div>
            <DefinitionList
              dense
              items={[
                { term: 'Price', detail: selected.priceU !== null ? `${selected.priceLabel} per job` : 'You set the budget', note: selected.priceU !== null ? (selected.priceFresh ? 'Signed by the agent, current' : 'Last price it signed; re-quoted when you hire') : 'No signed quote yet' },
                { term: 'Answers in', detail: selected.medianMs === null ? 'Not measured' : formatMs(selected.medianMs), note: selected.medianMs === null ? undefined : '30-day median' },
                { term: 'Paid work', detail: selected.paid.jobs === 0 ? 'None through Pokter yet' : `${selected.paid.completed} of ${plural(selected.paid.jobs, 'job')} completed` },
                { term: 'Delivered by', detail: selected.deliveredByPokter ? 'Pokter’s seller, carrying your brief' : 'The agent itself' },
              ]}
            />
            {selected.description && <p className="line-clamp-4 text-body-s leading-relaxed text-ink-secondary">{selected.description}</p>}
            <div className="flex flex-col gap-2 pt-1">
              {selected.hirable ? (
                <Button href={`/agents/${selected.chainId}/${selected.tokenId}?hire=1`} variant="primary" block>
                  Hire {selected.priceU !== null ? `for ${selected.priceLabel}` : ''}
                </Button>
              ) : (
                <p className="text-small text-ink-muted">Not ready to hire: the record is below the bar. You can still read it.</p>
              )}
              <Button href={`/agents/${selected.chainId}/${selected.tokenId}`} block>
                Open the record
              </Button>
            </div>
          </aside>
        )}
      </div>

      {/* ── Compare drawer ────────────────────────────────────────── */}
      <Drawer open={compareOpen} onClose={() => setCompareOpen(false)} title={`Compare ${compared.length}`} description="Side by side. Numbers are what Pokter measured; the price is what each agent signed." width="sm:max-w-[40rem]">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, compared.length)}, minmax(0, 1fr))` }}>
          {compared.map((row) => (
            <div key={row.key} className="flex min-w-0 flex-col gap-3">
              <div>
                <p className="truncate text-body-s font-semibold" title={row.name}>
                  {row.name}
                </p>
                <p className="text-small text-ink-muted">{row.categoryLabel}</p>
              </div>
              <Strip cells={row.cells} />
              <dl className="flex flex-col gap-2 text-small">
                {[
                  ['Evidence', VERDICT_LABEL[row.verdict]],
                  ['Answered', row.probes ? `${percent(row.rate)} of ${row.probes}` : '—'],
                  ['Answers in', row.medianMs === null ? '—' : formatMs(row.medianMs)],
                  ['Price', row.priceU !== null ? row.priceLabel : 'You set it'],
                  ['Paid work', row.paid.jobs ? `${row.paid.completed}/${row.paid.jobs}` : '—'],
                  ['Delivered by', row.deliveredByPokter ? 'Pokter’s seller' : 'Itself'],
                ].map(([term, detail]) => (
                  <div key={term} className="flex flex-col border-t border-line pt-1.5">
                    <dt className="text-caption uppercase tracking-wide text-ink-faint">{term}</dt>
                    <dd className="tabular text-ink">{detail}</dd>
                  </div>
                ))}
              </dl>
              <Button href={`/agents/${row.chainId}/${row.tokenId}`} size="sm" block>
                Open
              </Button>
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
