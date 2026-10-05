'use client';

import { cn } from '@/lib/ui/cn';
import type { ChainFunding } from '@/lib/wallet/use-chain-funding';

const OPTIONS = [
  { chainId: 97 as const, label: 'BNB Testnet', note: 'Where hiring settles' },
  { chainId: 56 as const, label: 'BNB Chain', note: 'Mainnet identity' },
];

/**
 * Where the identity gets written, and whether this wallet can pay for it.
 *
 * Both choices are shown rather than hidden in a select, because the one
 * thing a builder needs in order to choose is the thing a select hides:
 * whether the wallet holds gas on that chain. Switching to find out, and
 * switching back, is the interaction the colour removes.
 *
 * Testnet is first because it is where hiring settles, so it is where an
 * agent can earn a record rather than only exist.
 */
export function IdentityNetworkToggle({
  value,
  onChange,
  funding,
  disabled = false,
}: {
  value: 56 | 97;
  onChange: (chainId: 56 | 97) => void;
  funding: { 56: ChainFunding; 97: ChainFunding };
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium">Identity network</span>
      <div role="radiogroup" aria-label="Identity network" className="grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => {
          const selected = value === option.chainId;
          const { funded } = funding[option.chainId];
          return (
            <button
              key={option.chainId}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.chainId)}
              className={cn(
                'tap flex flex-col items-start gap-0.5 rounded-[var(--radius)] border-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                selected
                  ? 'border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)]'
                  : 'border-[color:var(--border)] hover:border-[color:var(--border-strong)]',
              )}
            >
              <span className="flex items-center gap-1.5 text-[12px] font-medium">
                {option.label}
                {/*
                  Funded or not, as a dot beside a word rather than colour
                  alone — the state has to survive being read by somebody
                  who cannot tell the two hues apart.
                */}
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 rounded-full',
                    funded === null
                      ? 'bg-[color:var(--text-faint)]'
                      : funded
                        ? 'bg-[color:var(--positive)]'
                        : 'bg-[color:var(--negative)]',
                  )}
                />
              </span>
              <span className="text-[10px] leading-4 text-[color:var(--text-muted)]">
                {funded === null
                  ? option.note
                  : funded
                    ? 'Funded for gas'
                    : 'No gas here'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
