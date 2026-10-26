'use client';

import { useMemo, useState } from 'react';

import { REQUEST_CATEGORIES, requestCategoryOf, requestTokenOf, type RequestCategory } from '@/lib/briefs/model';
import { displaySymbol } from '@/lib/network/tokens';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { RequestRow, type RequestRowData } from './RequestRow';

type Sort = 'newest' | 'budget' | 'closing' | 'fewest';
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'newest', label: 'Newest' },
  { id: 'budget', label: 'Highest budget' },
  { id: 'closing', label: 'Closing soonest' },
  { id: 'fewest', label: 'Fewest proposals' },
];

/** The money a request is in: one token on one chain. Testnet $U and mainnet $U are different money. */
const moneyKey = (r: RequestRowData) => `${r.chainId}:${requestTokenOf(r)?.address ?? 'unknown'}`;
const moneyName = (r: RequestRowData) => {
  const token = requestTokenOf(r);
  return `${r.chainId === 97 ? 'test ' : ''}${token ? displaySymbol(token) : 'unknown token'}`;
};
const rawOf = (r: RequestRowData) => {
  try {
    return BigInt(r.budgetRaw);
  } catch {
    return 0n;
  }
};

/**
 * Highest budget first, but only within one token: requests are grouped by
 * their money (in a fixed order, so the groups do not shuffle) and ordered
 * by exact base units inside each group. Two amounts in different tokens
 * are never compared, even at the same decimals.
 */
function byBudget(a: RequestRowData, b: RequestRowData): number {
  const ka = moneyKey(a);
  const kb = moneyKey(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  const ra = rawOf(a);
  const rb = rawOf(b);
  return ra === rb ? 0 : ra > rb ? -1 : 1;
}

/**
 * The open requests, searchable and filtered in place.
 *
 * Everything is already on the page — the board is small, and a builder
 * scanning it should not wait on a round trip per keystroke. Requests that
 * are no longer taking proposals sit behind one toggle at the end: they
 * are the record, not the work.
 */
export function RequestsBoard({ requests, now, networks }: { requests: Array<RequestRowData & { taking: boolean }>; now: number; networks: number[] }) {
  const [query, setQuery] = useState('');
  const [network, setNetwork] = useState<'all' | string>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [category, setCategory] = useState<RequestCategory | 'all'>('all');
  const [showClosed, setShowClosed] = useState(false);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = requests.filter(
      (r) =>
        (network === 'all' || String(r.chainId) === network) &&
        (category === 'all' || requestCategoryOf(r.category) === category) &&
        words.every((w) => `${r.title} ${r.brief}`.toLowerCase().includes(w)),
    );
    const closingAt = (r: RequestRowData) => (r.closesAt ? Date.parse(r.closesAt) : Number.POSITIVE_INFINITY);
    return rows.sort((a, b) =>
      sort === 'budget'
        ? byBudget(a, b)
        : sort === 'closing'
          ? closingAt(a) - closingAt(b)
          : sort === 'fewest'
            ? a.proposals - b.proposals
            : Date.parse(b.postedAt) - Date.parse(a.postedAt),
    );
  }, [requests, query, network, category, sort]);

  const open = filtered.filter((r) => r.taking);
  /* More than one money on the board: "highest budget" orders within each token, and says so. */
  const moneys = [...new Set(open.map(moneyKey))];
  const mixedMoney = moneys.length > 1;
  const closed = filtered.filter((r) => !r.taking);
  const filtering = query.trim() !== '' || network !== 'all' || category !== 'all';
  const clear = () => {
    setQuery('');
    setNetwork('all');
    setCategory('all');
  };

  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      <div className={cn('grid grid-cols-2 gap-3', networks.length > 1 ? 'sm:grid-cols-[minmax(0,1fr)_auto_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]')}>
        <label className="relative col-span-2 sm:col-span-1">
          <span className="sr-only">Search requests</span>
          <Icon.Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by task, skill or deliverable"
            className="h-11 w-full rounded-[10px] border border-rule-strong bg-raised pl-10 pr-3 text-[14.5px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
        </label>
        {networks.length > 1 && (
          <Select aria-label="Network" value={network} onChange={(e) => setNetwork(e.target.value)} className="sm:w-44">
            <option value="all">All networks</option>
            {networks.map((id) => (
              <option key={id} value={id}>
                {id === 56 ? 'BNB Chain' : 'BNB Testnet'}
              </option>
            ))}
          </Select>
        )}
        <div className={cn(networks.length <= 1 && 'col-span-2 sm:col-span-1')}>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sm:w-44">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === 'budget' && mixedMoney ? 'Highest budget, per token' : s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {sort === 'budget' && mixedMoney && (
        <p className="text-[12.5px] text-ink-3">
          These requests are priced in different tokens ({[...new Set(open.map(moneyName))].join(', ')}). Each token is sorted on its own, highest first; amounts in
          different tokens are not compared.
        </p>
      )}

      <div role="radiogroup" aria-label="Category" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {[{ id: 'all' as const, label: 'All requests' }, ...REQUEST_CATEGORIES].map((c) => {
          const on = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setCategory(c.id)}
              className={cn(
                'h-9 shrink-0 rounded-full border px-4 text-[13.5px] font-medium transition-colors',
                on ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink-3 hover:text-ink',
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {open.length > 0 ? (
        /* A grid when the column has room for two cards, keyed to the column and not the window: beside the posting card a 1024px window leaves it 600px. */
        <ul className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
          {open.map((r) => (
            <li key={r.id}>
              <RequestRow request={r} now={now} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-rule-strong px-5 py-6">
          <p className="text-[15px] font-medium">{filtering ? 'No open requests match' : 'No open requests right now'}</p>
          <p className="text-[13.5px] text-ink-2">
            {filtering ? 'Try fewer words, or another category or network.' : 'Post the first one, or check back: requests appear here as soon as they are signed.'}
          </p>
          {filtering && (
            <Button size="s" intent="secondary" onClick={clear}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {closed.length > 0 && (
        <div className="flex flex-col gap-3 pt-2">
          <button
            type="button"
            aria-expanded={showClosed}
            onClick={() => setShowClosed((v) => !v)}
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink"
          >
            {showClosed ? 'Hide' : 'Show'} {closed.length} no longer taking proposals
            <Icon.ChevronDown size={14} className={cn('transition-transform', showClosed && 'rotate-180')} />
          </button>
          {showClosed && (
            <ul className="grid grid-cols-1 gap-3 opacity-80 @2xl:grid-cols-2">
              {closed.map((r) => (
                <li key={r.id}>
                  <RequestRow request={r} now={now} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
