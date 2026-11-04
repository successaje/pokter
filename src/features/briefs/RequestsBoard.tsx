'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { REQUEST_CATEGORIES, requestCategoryOf, requestTokenOf, type RequestCategory } from '@/lib/briefs/model';
import { displaySymbol } from '@/lib/network/tokens';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { RequestRow, type RequestRowData } from './RequestRow';

type View = 'open' | 'chosen' | 'history';
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
 * The request board, searchable and filtered in place.
 *
 * Everything is already on the page — the board is small, and a builder
 * scanning it should not wait on a round trip per keystroke. The three views
 * keep work taking proposals separate from chosen and past requests.
 */
export function RequestsBoard({ requests, now, networks }: { requests: Array<RequestRowData & { taking: boolean }>; now: number; networks: number[] }) {
  const [view, setView] = useState<View>('open');
  const [query, setQuery] = useState('');
  const [network, setNetwork] = useState<'all' | string>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [category, setCategory] = useState<RequestCategory | 'all'>('all');

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

  const totals: Record<View, number> = {
    open: requests.filter((r) => r.taking).length,
    chosen: requests.filter((r) => r.state === 'awarded').length,
    history: requests.filter((r) => !r.taking && r.state !== 'awarded').length,
  };
  const visible = filtered.filter((r) => view === 'open' ? r.taking : view === 'chosen' ? r.state === 'awarded' : !r.taking && r.state !== 'awarded');
  /* More than one money on the board: "highest budget" orders within each token, and says so. */
  const moneys = [...new Set(visible.map(moneyKey))];
  const mixedMoney = moneys.length > 1;
  const filtering = query.trim() !== '' || network !== 'all' || category !== 'all';
  const clear = () => {
    setQuery('');
    setNetwork('all');
    setCategory('all');
  };

  return (
    <div className="@container mt-6 flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule">
        <nav aria-label="Request views" className="flex gap-5 sm:gap-8">
          {([
            { id: 'open', label: 'Open' },
            { id: 'chosen', label: 'Chosen' },
            { id: 'history', label: 'History' },
          ] as const).map((option) => (
            <button key={option.id} type="button" aria-pressed={view === option.id} onClick={() => setView(option.id)} className={cn('-mb-px flex items-baseline gap-1.5 border-b-2 pb-3 text-[14px] transition-colors sm:text-[15px]', view === option.id ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>
              {option.label} <span className="t-readout text-[12px] font-normal">{totals[option.id]}</span>
            </button>
          ))}
        </nav>
        <Link href="/api/v1/requests" className="t-readout mb-3 text-[12px] text-ink-3 hover:text-ink hover:underline">API ↗</Link>
      </div>

      {requests.length > 0 && (
        <>
          <div className={cn('grid max-w-5xl grid-cols-2 gap-3', networks.length > 1 ? 'sm:grid-cols-[minmax(0,1fr)_auto_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]')}>
            <label className="relative col-span-2 sm:col-span-1">
              <span className="sr-only">Search requests</span>
              <Icon.Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by task or deliverable" className="h-11 w-full rounded-[10px] border border-rule-strong bg-raised pl-10 pr-3 text-[14.5px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none" />
            </label>
            {networks.length > 1 && (
              <Select aria-label="Network" value={network} onChange={(e) => setNetwork(e.target.value)} className="sm:w-44">
                <option value="all">All networks</option>
                {networks.map((id) => <option key={id} value={id}>{id === 56 ? 'BNB Chain' : 'BNB Testnet'}</option>)}
              </Select>
            )}
            <div className={cn(networks.length <= 1 && 'col-span-2 sm:col-span-1')}>
              <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sm:w-44">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.id === 'budget' && mixedMoney ? 'Highest budget, per token' : s.label}</option>)}
              </Select>
            </div>
          </div>
          {sort === 'budget' && mixedMoney && (
            <p className="text-[12.5px] text-ink-3">These requests use different tokens ({[...new Set(visible.map(moneyName))].join(', ')}). Budgets are sorted within each token.</p>
          )}
          <div role="radiogroup" aria-label="Category" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
            {[{ id: 'all' as const, label: 'All categories' }, ...REQUEST_CATEGORIES].map((c) => {
              const on = category === c.id;
              return <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setCategory(c.id)} className={cn('h-9 shrink-0 rounded-full border px-4 text-[13.5px] font-medium transition-colors', on ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink-3 hover:text-ink')}>{c.label}</button>;
            })}
          </div>
        </>
      )}

      {visible.length > 0 ? (
        <div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((r) => <li key={r.id}><RequestRow request={r} now={now} board /></li>)}
          </ul>
        </div>
      ) : (
        <div className="flex min-h-48 flex-col items-start justify-center gap-3 rounded-[14px] border border-rule bg-raised px-6 py-8 sm:px-8">
          <p className="text-[17px] font-semibold tracking-[-0.01em]">{filtering ? 'No requests match these filters' : view === 'open' ? 'No requests taking proposals right now' : view === 'chosen' ? 'No agents chosen yet' : 'No past requests yet'}</p>
          <p className="max-w-lg text-[13.5px] leading-relaxed text-ink-2">{filtering ? 'Try fewer words, another category, or another network.' : view === 'open' ? 'Signed requests appear here as soon as buyers post them. Posting a request does not fund a job.' : view === 'chosen' ? 'A request moves here when its buyer chooses a proposal.' : 'Requests that stop taking proposals appear here.'}</p>
          {filtering && <Button size="s" intent="secondary" onClick={clear}>Clear filters</Button>}
          {!filtering && view === 'open' && <Link href="/workspace/requests/new" className="mt-1 text-[13px] font-medium text-ink hover:underline">Post a request →</Link>}
        </div>
      )}
    </div>
  );
}
