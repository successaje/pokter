'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { directHref, parseHeaderQuery, type HeaderSuggestion } from '@/lib/search/header-query';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

const KIND_ICON: Record<HeaderSuggestion['kind'], React.ReactNode> = {
  agent: <Icon.User size={15} />,
  job: <Icon.Briefcase size={15} />,
  builder: <Icon.Layers size={15} />,
  discover: <Icon.Search size={15} />,
};

/**
 * Search from the header, for something the person can already name.
 *
 * The icon used to go to Discover, which reads every query as a description
 * of work, so a name, "56/367904" or a job number from a receipt led to a
 * page of loosely related agents. It now opens a field in the header row,
 * over the navigation rather than pushing it about, and suggests what the
 * text names as it is typed: an agent by name or id, a job, a builder.
 * Words still end in a Discover search, as the last row and on Enter.
 */
export function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  /* Open on one page only: following a suggestion is the search finishing, so a new page closes it. */
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ for: string; rows: HeaderSuggestion[] } | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const query = text.trim();
  const rows = result && result.for === query ? result.rows : [];
  const loading = query.length > 0 && result?.for !== query;

  const openSearch = () => {
    setText('');
    setResult(null);
    setActive(0);
    setOpenOn(pathname);
  };
  const close = () => setOpenOn(null);

  /* "/" and ⌘K, from anywhere that is not already a text field. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openSearch reads only the current pathname, set again on every render
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  /* Debounced, and a reply for older text is dropped by `for`. */
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((body: { suggestions?: HeaderSuggestion[] }) => {
          setResult({ for: query, rows: body.suggestions ?? [] });
          setActive(0);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ for: query, rows: [] });
        });
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const submit = () => {
    if (!query) return;
    const chosen = rows[active] ?? rows[0];
    if (chosen) return go(chosen.href);
    /* Before suggestions arrive, only where the text cannot mean anything else. */
    const direct = directHref(parseHeaderQuery(query));
    if (direct) return go(direct);
    if (!loading) go(`/discover?q=${encodeURIComponent(query)}`);
  };

  const parsed = parseHeaderQuery(query);
  const emptyNote =
    !loading && query && rows.length === 0
      ? parsed.kind === 'number'
        ? `No agent or job #${parsed.value} in Pokter's index.`
        : 'Nothing found.'
      : null;

  return (
    /* Positioned against the header on a phone, where the icon sits mid-row and a field anchored to it ran off the left edge; against the icon from `sm` up. */
    <div ref={root} className="sm:relative">
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search agents, jobs and builders"
        title="Search (/)"
        aria-expanded={open}
        /* Never hidden while focused: Chrome drops focus from an element that is hidden, and the field covers it anyway. */
        className="grid size-9 place-items-center rounded-[8px] text-ink-2 hover:bg-sunken hover:text-ink"
      >
        <Icon.Search size={17} />
      </button>

      {open && (
        <div className="absolute inset-x-4 top-1/2 z-50 -translate-y-1/2 sm:inset-x-auto sm:right-0 sm:w-[24rem]">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="anim-search flex h-10 items-center gap-2 rounded-[10px] border border-rule-strong bg-raised pl-3 pr-1 shadow-sm focus-within:border-ink"
          >
            <Icon.Search size={16} className="shrink-0 text-ink-3" />
            <input
              ref={input}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') close();
                if (e.key === 'ArrowDown' && rows.length > 0) {
                  e.preventDefault();
                  setActive((i) => (i + 1) % rows.length);
                }
                if (e.key === 'ArrowUp' && rows.length > 0) {
                  e.preventDefault();
                  setActive((i) => (i - 1 + rows.length) % rows.length);
                }
              }}
              placeholder="Agent name, 56/367904, job #…"
              aria-label="Search agents, jobs and builders"
              role="combobox"
              aria-expanded={rows.length > 0}
              aria-controls={listId}
              aria-activedescendant={rows.length > 0 ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
            />
            <button type="button" onClick={close} aria-label="Close search" className="grid size-8 shrink-0 place-items-center rounded-[8px] text-ink-3 hover:bg-sunken hover:text-ink">
              <Icon.Close size={15} />
            </button>
          </form>

          {query && (rows.length > 0 || emptyNote || loading) && (
            <div className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-[12px] border border-rule bg-raised shadow-lg">
              {rows.length > 0 ? (
                <ul id={listId} role="listbox" aria-label="Suggestions" className="max-h-[60vh] overflow-y-auto py-1">
                  {rows.map((row, i) => (
                    <li
                      key={`${row.kind}:${row.href}`}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onPointerEnter={() => setActive(i)}
                      onClick={() => go(row.href)}
                      className={cn('flex cursor-pointer items-center gap-3 px-3 py-2', i === active && 'bg-sunken')}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-[8px] border border-rule text-ink-3">{KIND_ICON[row.kind]}</span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-ink">{row.label}</span>
                        <span className="truncate text-[12px] text-ink-3">{row.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2.5 text-[13px] text-ink-3" role="status">
                  {loading ? 'Looking…' : emptyNote}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
