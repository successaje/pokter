'use client';

import { cn } from '@/lib/ui/cn';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { Icon } from '@/ui/icons';
import { applyTheme, useTheme, type Theme } from './theme';

const ORDER: Array<{ id: Theme; label: string; icon: (p: { size?: number }) => React.ReactElement }> = [
  { id: 'system', label: 'System', icon: Icon.Monitor },
  { id: 'light', label: 'Light', icon: Icon.Sun },
  { id: 'dark', label: 'Dark', icon: Icon.Moon },
];

/** Cycles system → light → dark. The label says the state and the effect. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const hydrated = useHydrated();
  const index = Math.max(0, ORDER.findIndex((o) => o.id === theme));
  const current = ORDER[index];
  const next = ORDER[(index + 1) % ORDER.length];
  const Glyph = current.icon;
  return (
    <button
      type="button"
      onClick={() => applyTheme(next.id)}
      aria-label={`Theme: ${current.label}. Switch to ${next.label}.`}
      title={`Theme: ${current.label}`}
      className={cn('grid size-9 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-sunken hover:text-ink', className)}
    >
      {hydrated ? <Glyph size={17} /> : <span className="size-[17px]" />}
    </button>
  );
}

/** The explicit three-way choice, for settings and the mobile menu. */
export function ThemeSegmented({ className }: { className?: string }) {
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn('inline-flex rounded-[10px] bg-sunken p-[3px]', className)}>
      {ORDER.map((option) => {
        const Glyph = option.icon;
        const selected = option.id === theme;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => applyTheme(option.id)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium',
              selected ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink',
            )}
          >
            <Glyph size={15} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
