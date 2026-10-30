'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cn } from '@/lib/ui/cn';
import { Spinner } from '@/ui/Button';
import { Icon } from '@/ui/icons';

/*
 * Three, on one line: short labels, each running the full wording Discover
 * already reads correctly. Four wrapped to a second row under the box and
 * read as a menu rather than as examples. On a phone the third is left off
 * so the line never wraps.
 */
export const TASK_SUGGESTIONS = [
  { label: 'Check my lending risk', query: 'Check my lending risk' },
  { label: 'Is a token safe to buy?', query: 'Check if a token is safe to buy' },
  { label: 'Compare DeFi yields', query: 'Compare DeFi yield opportunities' },
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
    <div className={cn('flex flex-col', size === 'l' ? 'gap-3' : 'gap-2.5', className)}>
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
          placeholder="What do you need done?"
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
      <ul className="flex flex-nowrap gap-2 overflow-hidden" aria-label="Example tasks">
        {TASK_SUGGESTIONS.map((suggestion, i) => (
          <li key={suggestion.query} className={cn('shrink-0', i === 2 && 'max-sm:hidden')}>
            <Link
              href={`/discover?q=${encodeURIComponent(suggestion.query)}`}
              className={cn('inline-flex items-center whitespace-nowrap rounded-full border border-rule bg-paper text-ink-2 transition-colors hover:border-ink hover:text-ink', size === 'l' ? 'h-8 px-3 text-[13px]' : 'h-7 px-2.5 text-[12.5px]')}
            >
              {suggestion.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
