import type { AgentMaturity } from '@/lib/agents/maturity';
import { cn } from '@/lib/ui/cn';

export function MaturityLabel({ maturity, className }: { maturity: AgentMaturity; className?: string }) {
  const advanced = maturity.current === 'market-proven' || maturity.current === 'reliable-operator';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium',
        advanced ? 'border-ok/30 bg-ok/5 text-ok' : 'border-rule-strong text-ink-2',
        className,
      )}
      title={maturity.summary}
    >
      <span className={cn('size-1.5 rounded-full', advanced ? 'bg-ok' : 'bg-ink-3')} aria-hidden />
      {maturity.label}
    </span>
  );
}

export function MaturityLadder({ maturity, compact = false }: { maturity: AgentMaturity; compact?: boolean }) {
  return (
    <ol className={cn('grid gap-px overflow-hidden rounded-[12px] border border-rule bg-rule', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
      {maturity.steps.map((step) => (
        <li key={step.id} aria-label={`${step.label}: ${step.earned ? 'earned' : 'not earned'}`} className={cn('bg-raised p-3.5', step.earned ? 'text-ink' : 'text-ink-3')}>
          <span className="flex items-center gap-2 text-[12.5px] font-medium">
            <span className={cn('grid size-4 shrink-0 place-items-center rounded-full border text-[9px]', step.earned ? 'border-ok bg-ok text-white' : 'border-rule-strong')} aria-hidden>
              {step.earned ? '✓' : ''}
            </span>
            {step.label}
          </span>
          {!compact && <span className="mt-1.5 block text-[11.5px] leading-relaxed text-ink-3">{step.detail}</span>}
        </li>
      ))}
    </ol>
  );
}
