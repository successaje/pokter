'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cn } from '@/lib/ui/cn';
import { Spinner } from '@/ui/Button';
import { Icon } from '@/ui/icons';

export const TASK_SUGGESTIONS = [
  'Monitor my lending risk',
  'Compare DeFi yield opportunities',
  'Check if a token is safe to buy',
  'Review a liquidity position',
];

/**
 * The natural-language front door. A task goes to Discover as `?q=`, where
 * it is read for intent (category and matched terms are shown back to the
 * person) and ranked against measured agents. Suggestions are real searches,
 * not decoration.
 */
export function TaskSearch({ size = 'l', autoFocus, className }: { size?: 'l' | 'm'; autoFocus?: boolean; className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();

  const submit = (text: string) => {
    const q = text.trim();
    start(() => router.push(q ? `/discover?q=${encodeURIComponent(q)}` : '/discover'));
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className={cn(
          'group flex items-center gap-2 rounded-[14px] border border-rule-strong bg-raised pl-4 pr-1.5 shadow-[0_1px_0_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] focus-within:border-ink focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--signal)_28%,transparent)]',
          size === 'l' ? 'h-[60px]' : 'h-12',
        )}
      >
        <Icon.Search size={18} className="shrink-0 text-ink-3" />
        <label htmlFor="task-search" className="sr-only">
          What do you need an agent to do?
        </label>
        <input
          id="task-search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="What do you need an agent to do?"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={400}
          autoFocus={autoFocus}
          className={cn('h-full min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-3 focus:outline-none', size === 'l' ? 'text-[16px] sm:text-[17px]' : 'text-[15px]')}
        />
        <button
          type="submit"
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-ink font-medium text-paper transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_86%,var(--paper))]',
            size === 'l' ? 'h-12 px-4 text-[15px]' : 'h-9 px-3 text-sm',
          )}
        >
          {pending ? <Spinner /> : null}
          <span className="hidden sm:inline">Find an agent</span>
          <span className="sm:hidden">{pending ? '' : <Icon.Arrow size={16} />}</span>
        </button>
      </form>
      <ul className="flex flex-wrap gap-2" aria-label="Example tasks">
        {TASK_SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <Link
              href={`/discover?q=${encodeURIComponent(suggestion)}`}
              className="inline-flex h-8 items-center rounded-full border border-rule bg-paper px-3 text-[13px] text-ink-2 transition-colors hover:border-ink hover:text-ink"
            >
              {suggestion}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
