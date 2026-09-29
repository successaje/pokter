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

export function ActivitySummary({ jobs }: { jobs: HiredJob[] }) {
  const active = jobs.filter((job) => HELD.includes(job.status));
  const completed = jobs.filter((job) => job.status === 'COMPLETED');

  const figures = [
    {
      label: 'Active jobs',
      value: String(active.length),
      tone: 'text-[color:var(--info)]',
    },
    {
      label: 'Completed',
      value: String(completed.length),
      tone: 'text-[color:var(--positive)]',
    },
    {
      label: 'Committed',
      value: `${amount(jobs)} $U`,
      tone: '',
    },
    {
      label: 'In escrow',
      value: `${amount(active)} $U`,
      tone: 'text-[color:var(--brand)]',
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
          >
            <dt className="order-2 text-[11px] text-[color:var(--text-muted)]">
              {figure.label}
            </dt>
            <dd
              className={`tabular order-1 text-2xl font-medium leading-none ${figure.tone}`}
            >
              {figure.value}
            </dd>
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
