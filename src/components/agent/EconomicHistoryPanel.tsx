import { explorerTxUrl } from '@/lib/network/presentation';
import type { AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import { formatUnits } from 'viem';

function amount(value: string): string {
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })} $U`;
}

export function EconomicHistoryPanel({ history }: { history: AgentEconomicHistory }) {
  if (history.jobs === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-5">
        <p className="text-sm font-medium">No attributed paid work yet</p>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          Pokter has not indexed a funded ERC-8183 job whose immutable envelope
          names this ERC-8004 identity. This means no verified marketplace history,
          not zero work everywhere else.
        </p>
      </div>
    );
  }

  const metrics = [
    ['Funded jobs', history.jobs],
    ['Delivered', history.delivered],
    ['Completed', history.completed],
    ['Unresolved', history.unresolved],
    ['Rejected', history.rejected],
    ['Expired', history.expired],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] sm:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="border-b border-r border-[color:var(--border)] p-4 last:border-r-0">
            <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">{label}</dt>
            <dd className="tabular mt-1 text-xl">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-baseline justify-between gap-4 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4">
        <span className="text-[11px] text-[color:var(--text-muted)]">Total funded through indexed jobs</span>
        <strong className="tabular text-base">{amount(history.totalFundedU)}</strong>
      </div>

      <div>
        <h3 className="text-xs font-medium">Recent verified outcomes</h3>
        <ul className="mt-2 divide-y divide-[color:var(--border)] rounded-[var(--radius)] border border-[color:var(--border)]">
          {history.recent.map((job) => (
            <li key={`${job.chainId}:${job.jobId}`} className="flex flex-wrap items-center justify-between gap-3 p-3 text-[11px]">
              <span>
                <span className="font-medium">Job #{job.jobId}</span>
                <span className="text-[color:var(--text-muted)]"> · {job.status} · {amount(formatUnits(BigInt(job.budgetRaw), 18))}</span>
              </span>
              {job.hireTxHash && (
                <a href={explorerTxUrl(job.hireTxHash)} target="_blank" rel="noreferrer noopener" className="text-[color:var(--info)] underline decoration-dotted">
                  Funding transaction ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[12px] leading-relaxed text-[color:var(--text-faint)]">
        Coverage: Pokter-indexed ERC-8183 jobs only. Statuses are last-read chain
        states; this is not a claim about work performed outside Pokter.
        {history.latestCheckedAt ? ` Latest status check: ${new Date(history.latestCheckedAt).toLocaleString()}.` : ''}
      </p>
    </div>
  );
}
