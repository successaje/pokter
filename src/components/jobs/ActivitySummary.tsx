'use client';

import { formatUnits } from 'viem';

import { PAYMENT_VALUE_NOTE } from '@/lib/network/presentation';
import type { HiredJob } from '@/lib/erc8183/types';

/**
 * The four numbers someone opens this page to see.
 *
 * Deliberately in $U rather than a currency symbol. Every figure here is
 * testnet escrow, and rendering it as "$151.40" would put a dollar sign on
 * tokens the product states have no value — a small dishonesty, and exactly
 * the kind that makes the rest harder to believe.
 *
 * "Committed" rather than "spent": funding escrow is not spending. Money in a
 * funded job has left the wallet but not reached the agent, and can still come
 * back if nothing is delivered.
 */
function amount(jobs: HiredJob[]): string {
  const total = jobs.reduce((sum, job) => sum + BigInt(job.budgetRaw), 0n);
  return Number(formatUnits(total, 18)).toFixed(2);
}

/** Escrow that has left the wallet and not yet settled either way. */
const HELD: HiredJob['status'][] = ['OPEN', 'FUNDED', 'SUBMITTED'];

const icons = [
  <path key="jobs" d="M5 8.5 12 5l7 3.5v8L12 20l-7-3.5v-8ZM5 8.5l7 3.5 7-3.5M12 12v8" />,
  <path key="complete" d="m7 12 3 3 7-7" />,
  <><rect key="wallet" x="4" y="6" width="16" height="13" rx="3" /><path key="wallet-line" d="M4 9h13M15 13h5" /></>,
  <><circle key="clock" cx="12" cy="12" r="8" /><path key="clock-line" d="M12 8v5l3 2" /></>,
];

export function ActivitySummary({ jobs, connected = true }: { jobs: HiredJob[]; connected?: boolean }) {
  const active = jobs.filter((job) => HELD.includes(job.status));
  const completed = jobs.filter((job) => job.status === 'COMPLETED');

  const figures = [
    {
      label: 'Total jobs',
      value: connected ? String(jobs.length) : '—',
      note: connected ? `${active.length} active · ${completed.length} completed` : 'Connect to load',
      tone: 'text-[color:var(--info)]',
    },
    {
      label: 'Completed',
      value: connected ? String(completed.length) : '—',
      note: connected && jobs.length ? `${Math.round((completed.length / jobs.length) * 100)}% completion rate` : 'Verified settlements',
      tone: 'text-[color:var(--positive)]',
    },
    {
      label: 'Committed',
      value: connected ? `${amount(jobs)} $U` : '—',
      note: 'Total escrow funded',
      tone: '',
    },
    {
      label: 'In escrow',
      value: connected ? `${amount(active)} $U` : '—',
      note: 'Awaiting resolution',
      tone: 'text-[color:var(--brand)]',
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {figures.map((figure, index) => (
          <div
            key={figure.label}
            className="grid min-h-28 grid-cols-[auto_1fr] gap-x-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-[0_10px_30px_rgba(18,24,36,.035)]"
          >
            <span className={`row-span-3 grid size-10 place-items-center rounded-full ${index === 1 ? 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : 'bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]'}`} aria-hidden><svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{icons[index]}</svg></span>
            <dt className="text-[10px] font-medium text-[color:var(--text-muted)]">{figure.label}</dt>
            <dd
              className={`tabular text-2xl font-semibold leading-none ${figure.tone}`}
            >
              {figure.value}
            </dd>
            <dd className="text-[9px] leading-4 text-[color:var(--text-faint)]">{figure.note}</dd>
          </div>
        ))}
      </dl>
      {PAYMENT_VALUE_NOTE && (
        <p className="text-[11px] text-[color:var(--text-faint)]">
          {PAYMENT_VALUE_NOTE}.
        </p>
      )}
    </div>
  );
}
