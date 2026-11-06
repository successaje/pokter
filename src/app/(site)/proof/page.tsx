import type { Metadata } from 'next';
import Link from 'next/link';

import { isLifecycleDemo } from '@/lib/agent/credited-history';
import { courierPaidTest } from '@/lib/erc8183/courier-paid';
import { escrowCommerceAddress } from '@/lib/erc8183/addresses';
import { jobAmountLabel } from '@/lib/erc8183/job-amount';
import { getJobStore } from '@/lib/erc8183/store';
import { jobEvidencePath, utcWhen } from '@/lib/jobs/evidence-view';
import { jobReceipt } from '@/lib/jobs/receipt-link';
import { explorerBaseFor } from '@/lib/network/presentation';
import { filterLedger, ledgerRows, matchesAudience, summarizeLedger, type LedgerFilters, type LedgerMetric, type LedgerRow, type ProofAudience } from '@/lib/proof/ledger';
import { registeredWalletRead } from '@/lib/registry/live-agent';
import { teamWalletList, teamWalletSet } from '@/lib/team/server';
import { shortAddress } from '@/lib/ui/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Proof of work',
  description: 'Explore Pokter-indexed escrow jobs on BNB Mainnet and Testnet. See the funding, submission and outcome evidence for each job.',
  alternates: { canonical: '/proof' },
};

type Query = Record<string, string | string[] | undefined>;
type Filters = LedgerFilters & { audience: ProofAudience; page: number; sort: 'newest' | 'oldest'; window: 'all' | '7d' | '30d' };
const PAGE_SIZE = 24;
function renderedAt(): number { return Date.now(); }
const METRICS: LedgerMetric[] = ['funded', 'submitted', 'settled', 'outside-wallets', 'team', 'self', 'demo'];
const STATUSES = ['all', 'OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const;
const FUNDERS = ['all', 'outside', 'team', 'self', 'unknown'] as const;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

function parse(raw: Query): Filters {
  const network = first(raw.network);
  const funder = first(raw.funder) === 'outside-team' ? 'outside' : first(raw.funder);
  const requestedAudience = first(raw.audience);
  const audience: ProofAudience = requestedAudience === 'outside' || requestedAudience === 'team' ? requestedAudience
    : requestedAudience === 'all' ? 'all'
    : funder === 'outside' || funder === 'team' ? funder
    : first(raw.metric) === 'outside-wallets' ? 'outside'
    : first(raw.metric) === 'team' ? 'team' : 'all';
  const status = first(raw.status);
  const page = Number(first(raw.page));
  const window = first(raw.window);
  return {
    network: network === 'mainnet' || network === 'testnet' ? network : 'all',
    audience,
    funder: funder === 'outside' || funder === 'team' ? 'all' : FUNDERS.find((value) => value === funder) ?? 'all',
    status: STATUSES.find((value) => value === status) ?? 'all',
    metric: METRICS.find((value) => value === first(raw.metric)) ?? null,
    q: (first(raw.q) ?? '').trim().slice(0, 120),
    agent: /^\d+:\d+$/.test(first(raw.agent) ?? '') ? first(raw.agent)! : null,
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10_000) : 1,
    sort: first(raw.sort) === 'oldest' ? 'oldest' : 'newest',
    window: window === '7d' || window === '30d' ? window : 'all',
  };
}

function href(filters: Filters, change: Partial<Filters> = {}): string {
  const next = { ...filters, ...change };
  const q = new URLSearchParams();
  if (next.audience !== 'all') q.set('audience', next.audience);
  if (next.network !== 'all') q.set('network', next.network);
  if (next.funder !== 'all') q.set('funder', next.funder);
  if (next.status !== 'all') q.set('status', next.status);
  if (next.metric) q.set('metric', next.metric);
  if (next.q) q.set('q', next.q);
  if (next.agent) q.set('agent', next.agent);
  if (next.window !== 'all') q.set('window', next.window);
  if (next.sort !== 'newest') q.set('sort', next.sort);
  if (next.page > 1) q.set('page', String(next.page));
  return `/proof${q.size ? `?${q.toString()}` : ''}#ledger`;
}

const METRIC_LABEL: Record<LedgerMetric, string> = {
  funded: 'Funded jobs', submitted: 'With a submission', settled: 'Settled jobs',
  'outside-wallets': 'Outside-team wallets', team: 'Team-funded jobs', self: 'Self-hires', demo: 'Lifecycle demos',
};

function NetworkSummary({ network, rows, filters }: { network: 'mainnet' | 'testnet'; rows: LedgerRow[]; filters: Filters }) {
  const s = summarizeLedger(rows);
  const stats: { metric: LedgerMetric; value: number; note: string }[] = [
    { metric: 'funded', value: s.funded, note: 'Money entered escrow' },
    { metric: 'submitted', value: s.submitted, note: 'Submission, not a quality verdict' },
    { metric: 'settled', value: s.settled, note: 'Escrow completed' },
  ];
  const fundingWallets = new Set(rows.filter((row) => row.funded && row.job.client).map((row) => row.job.client!.toLowerCase())).size;
  return <section aria-label={`BNB ${network} evidence`} className="rounded-[16px] border border-rule bg-raised p-4 sm:p-5">
    <div className="flex items-center justify-between border-b border-rule pb-4">
      <h2 className="text-[17px] font-semibold"><span className={`mr-2 inline-block size-2 rounded-full ${network === 'mainnet' ? 'bg-ok' : 'bg-signal'}`} aria-hidden />BNB {network === 'mainnet' ? 'Mainnet' : 'Testnet'}</h2>
      <span className="t-readout text-[12px] text-ink-3">{network === 'mainnet' ? '56' : '97'} · {s.jobs} indexed</span>
    </div>
    <div className="mt-2 grid grid-cols-3 gap-1">{stats.map((stat) => <Link key={stat.metric} href={href(filters, { network, metric: stat.metric, q: '', funder: 'all', status: 'all', agent: null, window: 'all', page: 1 })} className="group rounded-[10px] p-3 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-ink"><span className="t-readout block text-[27px] leading-none tabular-nums">{stat.value.toLocaleString('en-US')}</span><span className="mt-2 block text-[12.5px] font-medium group-hover:underline">{METRIC_LABEL[stat.metric]}</span><span className="mt-0.5 block text-[11px] text-ink-3">{stat.note}</span></Link>)}</div>
    {filters.audience !== 'all' && <p className="mt-1 px-3 text-[12px] text-ink-3">{fundingWallets} known funding wallet{fundingWallets === 1 ? '' : 's'} in this view.</p>}
    {network === 'testnet' && <p className="mt-1 px-3 text-[12px] text-ink-3">Testnet tokens have no monetary value.</p>}
  </section>;
}

function Buyer({ row }: { row: LedgerRow }) {
  const label = row.funder === 'team' ? 'Pokter team' : row.funder === 'self' ? 'Self-hire' : row.funder === 'outside' ? 'Outside declared team' : 'Unknown funder';
  return <span className="min-w-0"><span className="block font-medium text-ink">{label}</span>{row.job.client ? <a href={`${explorerBaseFor(row.job.chainId)}/address/${row.job.client}`} target="_blank" rel="noreferrer noopener" title={row.job.client} aria-label={`View funding wallet ${row.job.client} on BscScan`} className="t-readout block w-fit text-[11.5px] text-ink-3 hover:underline">{shortAddress(row.job.client)}</a> : <span className="block text-[11px] text-ink-3">Address not retained</span>}</span>;
}

function State({ row, courier }: { row: LedgerRow; courier: boolean }) {
  const status = row.job.status;
  const label = status === 'OPEN' ? 'Created' : status === 'FUNDED' ? 'Awaiting delivery' : status === 'SUBMITTED' ? 'Submitted, in review' : status === 'COMPLETED' ? 'Settled' : status === 'EXPIRED' ? 'Refund claimed' : 'Rejected';
  return <span><span className={`block font-medium ${status === 'COMPLETED' ? 'text-ok' : status === 'EXPIRED' || status === 'REJECTED' ? 'text-watch' : 'text-ink'}`}>{label}</span>{row.lifecycleDemo && <span className="block text-[11px] text-ink-3">Lifecycle demo · no agent answer</span>}{courier && <span className="block text-[11px] text-ink-3">Pokter courier was the paid provider</span>}</span>;
}

function EvidenceLinks({ row }: { row: LedgerRow }) {
  const j = row.job;
  const receipt = jobReceipt(j, escrowCommerceAddress);
  return <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]"><Link href={jobEvidencePath(j)} className="font-semibold text-ink hover:underline">Job evidence →</Link>{j.hireTxHash && <a href={`${explorerBaseFor(j.chainId)}/tx/${j.hireTxHash}`} target="_blank" rel="noreferrer noopener" className="text-ink-2 hover:underline">Funding tx ↗</a>}{receipt.hash && receipt.hash !== j.hireTxHash && <a href={receipt.href} target="_blank" rel="noreferrer noopener" className="text-ink-2 hover:underline">Outcome tx ↗</a>}</span>;
}

function Amount({ row }: { row: LedgerRow }) {
  const job = row.job;
  return <span className="block"><span className="font-medium">{job.paymentToken ? jobAmountLabel(job) : 'Currency not yet read'}</span>{!job.paymentToken && <details className="mt-1 text-[11px] font-normal text-ink-3"><summary className="w-fit cursor-pointer hover:underline">Show raw amount</summary><code className="block max-w-[14rem] break-all">{job.budgetRaw} base units</code></details>}{job.chainId === 97 && <span className="block text-[11px] font-normal text-ink-3">Test tokens</span>}</span>;
}

export default async function ProofPage({ searchParams }: { searchParams: Promise<Query> }) {
  const filters = parse(await searchParams);
  const team = teamWalletSet();
  const rows = ledgerRows(getJobStore().all(), team, isLifecycleDemo);
  const audienceRows = rows.filter((row) => matchesAudience(row, filters.audience));
  const cutoff = filters.window === 'all' ? null : renderedAt() - (filters.window === '7d' ? 7 : 30) * 86_400_000;
  const inWindow = cutoff === null ? audienceRows : audienceRows.filter((row) => Date.parse(row.job.hiredAt) >= cutoff);
  const matching = filterLedger(inWindow, filters).sort((a, b) => filters.sort === 'newest' ? b.job.hiredAt.localeCompare(a.job.hiredAt) : a.job.hiredAt.localeCompare(b.job.hiredAt));
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const visible = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const courier = await courierPaidTest(visible.map((row) => row.job), team, registeredWalletRead);
  const all = summarizeLedger(rows);
  const oldest = all.oldestCheckedAt ? utcWhen(all.oldestCheckedAt) : null;
  const newest = all.newestCheckedAt ? utcWhen(all.newestCheckedAt) : null;
  const stale = all.oldestCheckedAt && renderedAt() - Date.parse(all.oldestCheckedAt) > 6 * 60 * 60 * 1000;

  return <div className="frame pb-24 pt-10 sm:pt-14">
    <header className="max-w-[860px]"><span className="t-label flex items-center gap-2"><span className="tile" aria-hidden /> Proof of work</span><h1 className="t-h1 mt-4">Every job has a trail.</h1><p className="t-lede mt-4 max-w-[720px]">Follow the funding, submission and escrow outcome of jobs Pokter indexed on BNB Mainnet and Testnet. See the funding wallet where known, then open each job for its evidence.</p><p className="mt-4 max-w-[720px] text-[13px] leading-relaxed text-ink-2">A settled job proves an escrow outcome, not that its answer was useful. “Outside team” means the funding wallet is absent from Pokter’s published team set; it does not establish an independent person or an unsubsidised purchase.</p><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-3"><span>{all.jobs} total indexed jobs</span><span>Newest status read: {newest ?? 'unavailable'}</span><span>Oldest status read: {oldest ?? 'unavailable'}</span></div>{stale && <p role="status" className="mt-3 rounded-[10px] border border-rule bg-sunken px-4 py-3 text-[12.5px] text-watch">Some indexed statuses were last read over six hours ago. Open a job for its current escrow state; the index can lag the chain.</p>}</header>
    <section aria-label="Choose whose jobs to view" className="mt-9 flex flex-wrap items-center gap-3"><span className="text-[13px] font-medium text-ink-2">Show jobs from</span><nav aria-label="Funding audience" className="inline-flex flex-wrap gap-1 rounded-[11px] border border-rule bg-raised p-1">{([{ value: 'all', label: 'All' }, { value: 'outside', label: 'Outside buyers' }, { value: 'team', label: 'Pokter team' }] as const).map(({ value, label }) => <Link key={value} href={href(filters, { audience: value, funder: 'all', metric: null, status: 'all', page: 1 }).replace('#ledger', '#audience-results')} aria-current={filters.audience === value ? 'page' : undefined} className={`rounded-[8px] px-3 py-2 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ink ${filters.audience === value ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}>{label}</Link>)}</nav></section>
    <div id="audience-results" className="mt-4 scroll-mt-24 grid gap-4 xl:grid-cols-2"><NetworkSummary network="mainnet" rows={audienceRows.filter((row) => row.job.chainId === 56)} filters={filters} /><NetworkSummary network="testnet" rows={audienceRows.filter((row) => row.job.chainId === 97)} filters={filters} /></div><p className="mt-3 text-[12px] text-ink-3">{filters.audience === 'outside' ? 'Outside-team funding wallets are known addresses outside Pokter’s team set, excluding self-hires and known demos. This does not prove independent purchases.' : filters.audience === 'team' ? 'Pokter team counts include its tests and known lifecycle demos.' : 'All indexed jobs include outside-team, Pokter team, self-hire and unknown funding wallets, plus known demos.'} {filters.audience !== 'all' && 'Wallet counts are distinct within each network.'}</p>
    <section id="ledger" aria-labelledby="ledger-title" className="scroll-mt-24 pt-12"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5"><div><span className="t-label">The record</span><h2 id="ledger-title" className="t-h2 mt-2">Explore jobs</h2></div><div className="flex flex-wrap gap-4 text-[12.5px]"><Link href="/api/v1/receipts" className="font-medium hover:underline">Receipts JSON ↗</Link><Link href="/api/v1/receipts/verifier" download className="font-medium hover:underline">Independent verifier ↓</Link></div></div>
      <form action="/proof#ledger" method="get" className="mt-5 grid gap-3 rounded-[14px] border border-rule bg-raised p-4 sm:grid-cols-2 lg:grid-cols-[minmax(13rem,1.8fr)_repeat(4,minmax(7rem,1fr))_auto] lg:items-end">
        <label className="text-[12px] font-medium text-ink-2">Search job, agent or wallet<input name="q" type="search" defaultValue={filters.q} maxLength={120} placeholder="Job ID, name or address" className="mt-1.5 h-10 w-full min-w-0 rounded-[8px] border border-rule-strong bg-surface px-3 text-[13px] text-ink outline-none focus:border-ink" /></label>
        <label className="text-[12px] font-medium text-ink-2">Network<select name="network" defaultValue={filters.network} className="mt-1.5 h-10 w-full rounded-[8px] border border-rule-strong bg-surface px-2 text-[13px] text-ink"><option value="all">Both networks</option><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select></label>
        {filters.audience === 'all' ? <label className="text-[12px] font-medium text-ink-2">Funding detail<select name="funder" defaultValue={filters.funder} className="mt-1.5 h-10 w-full rounded-[8px] border border-rule-strong bg-surface px-2 text-[13px] text-ink"><option value="all">Any in this view</option><option value="self">Self-hire</option><option value="unknown">Unknown</option></select></label> : <span className="text-[12px] font-medium text-ink-2">Funding detail<span className="mt-1.5 flex h-10 items-center rounded-[8px] border border-rule bg-sunken px-3 text-[13px] text-ink-2">{filters.audience === 'outside' ? 'Outside buyers' : 'Pokter team'}</span></span>}
        <label className="text-[12px] font-medium text-ink-2">Escrow state<select name="status" defaultValue={filters.status} className="mt-1.5 h-10 w-full rounded-[8px] border border-rule-strong bg-surface px-2 text-[13px] text-ink">{STATUSES.map((value) => <option key={value} value={value}>{value === 'all' ? 'Any state' : value === 'OPEN' ? 'Created' : value === 'FUNDED' ? 'Awaiting delivery' : value === 'SUBMITTED' ? 'Submitted' : value === 'COMPLETED' ? 'Settled' : value === 'REJECTED' ? 'Rejected' : 'Refund claimed'}</option>)}</select></label>
        <label className="text-[12px] font-medium text-ink-2">Order<select name="sort" defaultValue={filters.sort} className="mt-1.5 h-10 w-full rounded-[8px] border border-rule-strong bg-surface px-2 text-[13px] text-ink"><option value="newest">Recently recorded</option><option value="oldest">Oldest recorded</option></select></label>
        {filters.audience !== 'all' && <input type="hidden" name="audience" value={filters.audience} />}{filters.metric && <input type="hidden" name="metric" value={filters.metric} />}{filters.agent && <input type="hidden" name="agent" value={filters.agent} />}{filters.window !== 'all' && <input type="hidden" name="window" value={filters.window} />}
        <button type="submit" className="h-10 rounded-[8px] bg-ink px-4 text-[13px] font-semibold text-paper hover:opacity-80">Apply</button>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-2"><p>{matching.length.toLocaleString('en-US')} matching job{matching.length === 1 ? '' : 's'} · page {page} of {pages}</p><div className="flex flex-wrap gap-2">{filters.metric && <Link href={href(filters, { metric: null, page: 1 })} className="rounded-full border border-rule px-3 py-1 hover:border-ink">{METRIC_LABEL[filters.metric]} ×</Link>}{filters.agent && <Link href={href(filters, { agent: null, page: 1 })} className="rounded-full border border-rule px-3 py-1 hover:border-ink">Agent {filters.agent} ×</Link>}{filters.window !== 'all' && <span className="rounded-full border border-rule px-3 py-1">Recorded in last {filters.window === '7d' ? '7' : '30'} days</span>}<Link href="/proof#ledger" className="hover:underline">Clear filters</Link></div></div>
      {visible.length ? <><ol className="mt-5 space-y-3 md:hidden">{visible.map((row) => <li key={`${row.job.chainId}:${row.job.jobId}`} className="rounded-[13px] border border-rule bg-raised p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={jobEvidencePath(row.job)} className="text-[15px] font-semibold hover:underline">{row.job.agentName}</Link><p className="mt-0.5 text-[11.5px] text-ink-3">Job #{row.job.jobId} · {row.job.chainId === 56 ? 'Mainnet' : 'Testnet'} · recorded {row.job.hiredAt.slice(0, 10)}</p></div><State row={row} courier={courier(row.job)} /></div><div className="mt-4 grid grid-cols-2 gap-4 border-y border-rule py-3 text-[12.5px]"><div><span className="t-label block text-[10px]">Funded by</span><Buyer row={row} /></div><div><span className="t-label block text-[10px]">Escrow amount</span><Amount row={row} /></div></div><div className="mt-3"><EvidenceLinks row={row} /></div></li>)}</ol>
        <div className="mt-5 hidden overflow-x-auto rounded-[14px] border border-rule md:block"><table className="w-full min-w-[780px] text-left text-[12.5px]"><thead className="bg-sunken"><tr>{['Job / agent', 'Funding wallet', 'Amount', 'Escrow state', 'Evidence'].map((head) => <th key={head} scope="col" className="t-label px-4 py-3 font-medium">{head}</th>)}</tr></thead><tbody className="divide-y divide-rule bg-raised">{visible.map((row) => <tr key={`${row.job.chainId}:${row.job.jobId}`} className="align-top"><td className="px-4 py-4"><Link href={jobEvidencePath(row.job)} className="font-semibold text-ink hover:underline">{row.job.agentName}</Link><span className="mt-1 block text-[11px] text-ink-3">#{row.job.jobId} · {row.job.chainId === 56 ? 'Mainnet' : 'Testnet'} · recorded {row.job.hiredAt.slice(0, 10)}</span></td><td className="px-4 py-4"><Buyer row={row} /></td><td className="px-4 py-4"><Amount row={row} /></td><td className="px-4 py-4"><State row={row} courier={courier(row.job)} /></td><td className="px-4 py-4"><EvidenceLinks row={row} /></td></tr>)}</tbody></table></div>
        <nav aria-label="Ledger pages" className="mt-5 flex items-center justify-between gap-4 text-[13px]"><span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, matching.length)} of {matching.length}</span><span className="flex gap-2">{page > 1 && <Link href={href(filters, { page: page - 1 })} className="rounded-[8px] border border-rule-strong px-4 py-2 hover:border-ink">← Previous</Link>}{page < pages && <Link href={href(filters, { page: page + 1 })} className="rounded-[8px] border border-rule-strong px-4 py-2 hover:border-ink">Next →</Link>}</span></nav></> : <div className="mt-5 rounded-[14px] border border-dashed border-rule-strong p-10 text-center text-[13px] text-ink-2">No indexed jobs match this view. <Link href="/proof#ledger" className="font-medium text-ink underline">Clear filters</Link></div>}
    </section>
    <section aria-labelledby="method-title" className="mt-14 grid gap-7 border-t border-rule pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]"><div><span className="t-label">Counting method</span><h2 id="method-title" className="t-h2 mt-2">What each number includes</h2><p className="mt-3 max-w-[650px] text-[13.5px] leading-relaxed text-ink-2">Each job is keyed by chain and escrow ID, so duplicate index writes count once. “Funded” requires a positive budget and an escrow state proving funding. “With a submission” means escrow records a delivery that is not a known lifecycle demo; it is not a hash or quality verdict. “Settled” means escrow reached Completed, including team tests and demos. Outside-team wallets are distinct known funders of positive-budget jobs, excluding team wallets, self-hires and known demos.</p><div className="mt-4 flex flex-wrap gap-2">{(['team', 'self', 'demo'] as const).map((metric) => <Link key={metric} href={href(filters, { audience: 'all', network: 'all', metric, q: '', funder: 'all', status: 'all', page: 1 })} className="rounded-full border border-rule px-3 py-1.5 text-[12px] hover:border-ink">{METRIC_LABEL[metric]} · {metric === 'demo' ? all.demos : all[metric]}</Link>)}<Link href={href(filters, { audience: 'all', network: 'all', funder: 'unknown', metric: null, status: 'all', q: '', page: 1 })} className="rounded-full border border-rule px-3 py-1.5 text-[12px] hover:border-ink">Unknown funders · {all.unknown}</Link></div><p className="mt-4 text-[12px] text-ink-3">These are ongoing marketplace records, not an official BNB Chain campaign eligibility decision. Legacy 7-day and 30-day URLs filter Pokter’s recording time, not a proven funding-block time.</p></div>
      <details className="group h-fit rounded-[14px] border border-rule bg-raised p-5 text-[13px] leading-relaxed text-ink-2" open><summary className="cursor-pointer font-semibold text-ink">How to check a job <span className="float-right transition-transform group-open:rotate-180" aria-hidden>⌄</span></summary><ol className="mt-4 list-decimal space-y-2 pl-5"><li>Open its evidence page. It reads current escrow state when the chain answers and labels an index fallback.</li><li>Open transaction links where recorded. A generic escrow contract page needs this job ID entered into <code>getJob</code>; it is not a job-specific receipt.</li><li>Compare the funder with Pokter’s <a href="#team-wallets" className="underline">declared team wallets</a>. Outside this set does not prove independence.</li><li>Check delivery hash and answer checks separately. A matching hash proves the record matches its commitment, not that the answer is correct.</li></ol><p className="mt-4">The <Link href="/api/v1/receipts/verifier" className="underline">downloadable verifier</Link> re-reads chain state. It starts from Pokter’s indexed IDs, so it does not establish that the index is exhaustive.</p></details></section>
    <details id="team-wallets" className="mt-7 rounded-[14px] border border-rule bg-raised p-5 text-[12.5px] text-ink-2"><summary className="cursor-pointer font-semibold text-ink">Published Pokter team wallets</summary><ul className="mt-4 space-y-2">{teamWalletList().map((entry) => <li key={entry.address} className="flex flex-wrap gap-x-3"><span>{entry.label}</span><code className="break-all">{entry.address}</code></li>)}</ul></details>
  </div>;
}
