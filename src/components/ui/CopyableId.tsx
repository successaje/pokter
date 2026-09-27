'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * A technical identifier the user can take with them.
 *
 * Registry ids, owner wallets, endpoints, job ids and transaction hashes are
 * all things someone reads here and then pastes somewhere else — an explorer,
 * a support message, a script. Selecting them by hand from a dense row is
 * awkward on a desktop and close to impossible on a phone.
 *
 * The confirmation names what was copied rather than saying "Copied!",
 * because these sit next to each other in groups and a generic message
 * leaves the user unsure which one they took.
 */
export function CopyableId({
  value,
  label,
  display,
  className,
}: {
  /** The exact text placed on the clipboard. */
  value: string;
  /** What this identifier is, e.g. "Identity". Used in the confirmation. */
  label: string;
  /** What to show, when it differs from the value (a shortened address). */
  display?: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /*
       * Clipboard access can be refused — an insecure origin, a permission
       * policy, an older browser. Saying "copied" when nothing was copied is
       * worse than saying nothing, so the confirmation is only shown on a
       * write that actually resolved.
       */
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label.toLowerCase()}: ${value}`}
      className={cn(
        'tap-safe group inline-flex items-center gap-1.5 rounded text-[color:var(--text-faint)] transition-colors hover:text-[color:var(--text-secondary)]',
        className,
      )}
    >
      <span className="mono min-w-0 truncate">{display ?? value}</span>
      {copied ? (
        <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-none stroke-[color:var(--positive)]" strokeWidth="2.2">
          <path d="m5 13 4 4L19 7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-none stroke-current opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" strokeWidth="1.8">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
      {/*
        Announced once, and only to assistive technology: the tick beside the
        value is the visual confirmation, so repeating it in text would be
        redundant on screen and silent duplication off it.
      */}
      <span aria-live="polite" className="sr-only">
        {copied ? `${label} copied` : ''}
      </span>
    </button>
  );
}
