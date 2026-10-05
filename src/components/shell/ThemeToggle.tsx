'use client';

import { useSyncExternalStore } from 'react';

/**
 * Theme selection.
 *
 * Three states, not two: dark, light, and following the system. "System" is the
 * default and is a real choice — a user whose OS switches at sunset should not
 * have to come back and flip this.
 *
 * The chosen value is written to the document element, where the CSS in
 * globals.css takes over. An inline script in the layout applies it before
 * first paint so the page never flashes the wrong theme.
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * The choice is kept in a cookie rather than localStorage so the server can
 * read it and stamp `data-theme` during SSR. That removes the pre-paint
 * inline script entirely: there is no flash to prevent, because the correct
 * theme is in the first byte of HTML.
 */
const COOKIE_KEY = 'pokter-theme';

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readCookie(): Theme {
  const match = document.cookie.match(/(?:^|;\s*)pokter-theme=(light|dark)/);
  return match ? (match[1] as Theme) : 'system';
}

function getTheme(): Theme {
  try {
    return readCookie();
  } catch {
    return 'system';
  }
}

/** Must match the server render, which cannot know the preference. */
function getServerTheme(): Theme {
  return 'system';
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  // A year, path-wide, Lax: a display preference, not a credential.
  document.cookie =
    theme === 'system'
      ? `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax`
      : `${COOKIE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;

  emit();
}

/*
 * One control, three states, cycled.
 *
 * The three states were three buttons sitting in the header at all times,
 * which spends a permanent slot in the busiest row of the product on a
 * preference most people set once and never revisit. Worse, two of the three
 * were always inert: whatever the current theme is, two thirds of that
 * control does nothing.
 *
 * So it shows the state it is in and advances on click. Nothing is lost —
 * every state is still reachable, and System keeps its place in the cycle
 * rather than being demoted to a long-press or a settings page, because
 * following the system is the default and a default you cannot get back to
 * is not a default.
 *
 * The order is light → dark → system. It reads as "lighter, darker, let the
 * machine decide", and it means the two states somebody is most likely to be
 * choosing between are one click apart.
 */
const CYCLE: { id: Theme; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: '☀' },
  { id: 'dark', label: 'Dark', icon: '☾' },
  { id: 'system', label: 'System', icon: '◐' },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);

  const index = Math.max(0, CYCLE.findIndex((option) => option.id === theme));
  const current = CYCLE[index]!;
  const next = CYCLE[(index + 1) % CYCLE.length]!;

  return (
    <button
      type="button"
      onClick={() => applyTheme(next.id)}
      /*
        The label names both, because an icon-only control that changes what
        it does each time it is pressed is otherwise unusable without sight
        of it: a screen reader user needs to know the state as well as the
        effect.
      */
      aria-label={`Colour theme: ${current.label}. Switch to ${next.label}.`}
      title={`Theme: ${current.label} — click for ${next.label}`}
      className="flex size-9 items-center justify-center rounded-full border border-[color:var(--border)] text-[13px] leading-none text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
    >
      <span aria-hidden>{current.icon}</span>
    </button>
  );
}
