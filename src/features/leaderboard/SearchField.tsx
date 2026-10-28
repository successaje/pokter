'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { MAX_SEARCH } from '@/lib/leaderboard/browse';
import { Icon } from '@/ui/icons';

/** Long enough that a fast typist sends one request, short enough to feel live. */
const DEBOUNCE_MS = 250;

/**
 * Search that narrows as you type, and still leaves a URL behind.
 *
 * The board was a form with a label and a Submit button, which is three
 * interactions to filter a list. This replaces it with one field, and
 * keeps the two things the form was doing that mattered: the term lives in
 * the query string, so a narrowed board can be shared and the back button
 * returns to the one before it.
 *
 * `replace` rather than `push` while typing — pushing would put one
 * history entry behind every keystroke and make Back feel broken. The
 * entry the reader came from is still the one Back returns to.
 *
 * Typing does not block: the field holds its own value and the board
 * catches up, so a slow board never eats a keystroke.
 */
export function SearchField({ placeholder = 'Search agents' }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get('q') ?? '';

  const [value, setValue] = useState(fromUrl);
  const [pending, startTransition] = useTransition();
  const statusId = useId();
  /* Set when this field is the reason the URL changed, so an external
     change (Back, a tab, a cleared filter) can still reset the field
     without fighting the typist mid-word. */
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setValue(fromUrl);
  }, [fromUrl]);

  useEffect(() => {
    if (!typing.current) return;
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      const term = value.trim();
      if (term) next.set('q', term.slice(0, MAX_SEARCH));
      else next.delete('q');
      /* Any narrowing returns to the first page: page 3 of a board that no
         longer has three pages is an empty screen that looks like no match. */
      next.delete('page');
      typing.current = false;
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value, params, pathname, router]);

  return (
    <div className="relative flex h-10 w-full items-center sm:w-56">
      <Icon.Search size={14} className="pointer-events-none absolute left-3 text-ink-3" aria-hidden />
      <input
        type="search"
        value={value}
        maxLength={MAX_SEARCH}
        onChange={(event) => {
          typing.current = true;
          setValue(event.target.value);
        }}
        aria-label="Search agents on this board"
        aria-describedby={statusId}
        placeholder={placeholder}
        className="h-10 w-full rounded-[10px] border border-rule bg-raised pl-9 pr-3 text-[13.5px] text-ink outline-none placeholder:text-ink-3 focus-visible:border-rule-strong focus-visible:ring-2 focus-visible:ring-signal/40"
      />
      {/*
        Announced, not just spun. A filter that updates under a screen
        reader with no word said is a list that silently changed length.
      */}
      <span id={statusId} role="status" aria-live="polite" className="sr-only">
        {pending ? 'Updating results' : value.trim() ? `Filtering by ${value.trim()}` : 'Showing all agents'}
      </span>
    </div>
  );
}
