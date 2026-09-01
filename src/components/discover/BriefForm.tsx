'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

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
          ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] text-[color:var(--text)]'
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
 * shareable, reloadable, and reproducible — a judge can send the exact query
 * that produced a result.
 */
export function BriefForm() {
  const router = useRouter();
  const params = useSearchParams();

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
    router.push(`/discover?${query.toString()}`);
  };

  return (
    <div className="flex flex-col gap-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="text-xs text-[color:var(--text-muted)]">
          I want to
        </legend>
        <div className="flex flex-wrap gap-2">
          {OBJECTIVES.map((option) => (
            <Choice
              key={option.id}
              selected={objective === option.id}
              onClick={() => setObjective(option.id)}
            >
              {option.label}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="text-xs text-[color:var(--text-muted)]">
          With about
        </legend>
        <div className="flex flex-wrap gap-2">
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

      <fieldset className="flex flex-col gap-2.5">
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
        <p className="text-[11px] text-[color:var(--text-faint)]">
          {RISKS.find((option) => option.id === risk)?.blurb}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="text-xs text-[color:var(--text-muted)]">Over</legend>
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
      </fieldset>

      <button
        type="button"
        onClick={submit}
        className="w-fit rounded-[var(--radius)] bg-[color:var(--text)] px-4 py-2 text-[13px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90"
      >
        Find my matches
      </button>
    </div>
  );
}
