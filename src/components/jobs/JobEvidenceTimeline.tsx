import { jobTimeline, type JobEvidenceSource } from '@/lib/jobs/timeline';
import type { HiredJob } from '@/lib/erc8183/types';
import { cn } from '@/lib/ui/cn';

const SOURCE: Record<JobEvidenceSource, string> = {
  onchain: 'Onchain',
  receipt: 'Receipt',
  pending: 'Pending',
};

export function JobEvidenceTimeline({ job, explorerBase }: { job: HiredJob; explorerBase: string }) {
  const steps = jobTimeline(job);
  return (
    <section aria-labelledby={`job-${job.jobId}-timeline`} className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--border)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-3 py-2.5">
        <h4 id={`job-${job.jobId}-timeline`} className="text-[10px] font-semibold">Execution record</h4>
        <p className="text-[9px] text-[color:var(--text-muted)]">Facts only · missing evidence stays missing</p>
      </div>
      <ol className="divide-y divide-[color:var(--border)] bg-[color:var(--surface)]">
        {steps.map((step, index) => (
          <li key={step.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 px-3 py-3">
            <div className="flex flex-col items-center">
              <span className={cn(
                'mt-0.5 flex size-5 items-center justify-center rounded-full border text-[12px] font-semibold',
                step.state === 'complete' && 'border-[color:var(--positive)] bg-[color:var(--positive-dim)] text-[color:var(--positive)]',
                step.state === 'current' && 'border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]',
                step.state === 'upcoming' && 'border-[color:var(--border-strong)] text-[color:var(--text-faint)]',
                step.state === 'terminal' && 'border-[color:var(--negative)] bg-[color:var(--negative-dim)] text-[color:var(--negative)]',
              )}>{step.state === 'complete' ? '✓' : step.state === 'terminal' ? '!' : index + 1}</span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold">{step.label}</p><span className={cn('rounded-full px-1.5 py-0.5 text-[12px] font-medium', step.source === 'onchain' ? 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : step.source === 'receipt' ? 'bg-[color:var(--info-dim)] text-[color:var(--info)]' : 'bg-[color:var(--bg-subtle)] text-[color:var(--text-muted)]')}>{SOURCE[step.source]}</span></div>
              <p className="mt-1 text-[9px] leading-4 text-[color:var(--text-muted)]">{step.detail}</p>
              {step.transactionHash && <a href={`${explorerBase}/tx/${step.transactionHash}`} target="_blank" rel="noreferrer" className="mono mt-1.5 inline-flex text-[12px] font-medium text-[color:var(--brand-strong)] hover:underline">View transaction {step.transactionHash.slice(0, 8)}… ↗</a>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

