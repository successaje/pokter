'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cn } from '@/lib/ui/cn';
import { OBJECTIVES } from '@/components/home/ObjectiveSelector';
import type { RiskTolerance } from '@/lib/recommend/types';

const CAPITAL_PRESETS = [500, 1_000, 5_000, 25_000];
const HORIZONS = [7, 30, 90];
const RISKS: { id: RiskTolerance; label: string; blurb: string }[] = [
  { id: 'low', label: 'Low', blurb: 'Only agents with near-perfect uptime.' },
  { id: 'medium', label: 'Medium', blurb: 'Balanced reliability and choice.' },
  { id: 'high', label: 'High', blurb: 'Include agents with thinner records.' },
];

const OBJECTIVE_MARKS: Record<string, string> = {
  earn: '↗',
  trade: '≋',
  protect: '◇',
  rebalance: '↻',
};

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-[var(--radius)] border px-3 py-2 text-[13px] transition-colors duration-150',
        selected
          ? 'border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)] text-[color:var(--text)]'
          : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]',
      )}
    >
      {children}
    </button>
  );
}

/**
 * §25. The brief.
 *
 * State lives in the URL rather than in the component, so a recommendation is
 * shareable, reloadable, and reproducible — anyone can send the exact query
 * that produced a result.
 */
export function BriefForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [objective, setObjective] = useState(
    params.get('objective') ?? OBJECTIVES[0].id,
  );
  const [capital, setCapital] = useState(Number(params.get('capital') ?? 5000));
  const [risk, setRisk] = useState<RiskTolerance>(
    (params.get('risk') as RiskTolerance) ?? 'medium',
  );
  const [horizon, setHorizon] = useState(Number(params.get('horizon') ?? 30));

  const submit = () => {
    const query = new URLSearchParams({
      objective,
      capital: String(capital),
      risk,
      horizon: String(horizon),
      run: '1',
    });
    startTransition(() => {
      router.push(`/discover?${query.toString()}#matches`);
    });
  };

  return (
    <div className="flex flex-col gap-7 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          What should your agent do?
        </legend>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {OBJECTIVES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setObjective(option.id)}
              aria-pressed={objective === option.id}
              className={cn(
                'group flex min-h-36 flex-col rounded-[var(--radius)] border p-3 text-left transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 sm:p-4 lg:min-h-32',
                objective === option.id
                  ? 'border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)]'
                  : 'border-[color:var(--border)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]',
              )}
            >
              <span
                aria-hidden
                className="mb-3 text-xl font-medium text-[color:var(--brand)] sm:mb-4"
              >
                {OBJECTIVE_MARKS[option.id]}
              </span>
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-[color:var(--text-muted)] lg:line-clamp-none">
                {option.blurb}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 border-t border-[color:var(--border)] pt-6 lg:grid-cols-3">
        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="text-xs text-[color:var(--text-muted)]">
            Capital
          </legend>
          <label className="flex items-center rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-3 focus-within:border-[color:var(--brand)]">
            <span className="text-sm text-[color:var(--text-muted)]">$</span>
            <input
              type="number"
              min="1"
              step="100"
              inputMode="decimal"
              value={capital}
              onChange={(event) => setCapital(Math.max(1, Number(event.target.value) || 1))}
              className="tabular min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
              aria-label="Capital in US dollars"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {CAPITAL_PRESETS.map((amount) => (
              <Choice
                key={amount}
                selected={capital === amount}
                onClick={() => setCapital(amount)}
              >
                <span className="tabular">${amount.toLocaleString('en-US')}</span>
              </Choice>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="text-xs text-[color:var(--text-muted)]">
            Risk tolerance
          </legend>
          <div className="flex flex-wrap gap-2">
            {RISKS.map((option) => (
              <Choice
                key={option.id}
                selected={risk === option.id}
                onClick={() => setRisk(option.id)}
              >
                {option.label}
              </Choice>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-[color:var(--text-faint)]">
            {RISKS.find((option) => option.id === risk)?.blurb}
          </p>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="text-xs text-[color:var(--text-muted)]">
            Time horizon
          </legend>
          <div className="flex flex-wrap gap-2">
            {HORIZONS.map((days) => (
              <Choice
                key={days}
                selected={horizon === days}
                onClick={() => setHorizon(days)}
              >
                <span className="tabular">{days} days</span>
              </Choice>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-[color:var(--text-faint)]">
            We weigh whether the recorded history is long enough for this window.
          </p>
        </fieldset>
      </div>

      <div className="flex flex-col gap-3 border-t border-[color:var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          Pokter checks registry identity, endpoint reliability, evidence depth and
          fit—then shows what did not qualify.
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="action-primary shrink-0 rounded-[var(--radius)] px-5 py-2.5 text-[13px]"
        >
          {isPending ? 'Checking evidence…' : 'Find agents'}
        </button>
      </div>
    </div>
  );
}
