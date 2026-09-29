'use client';

import { useEffect, useState } from 'react';

type State = 'idle' | 'copied' | 'failed';

/**
 * Share this agent.
 *
 * The URL is read from the browser rather than passed in, so it carries
 * whatever the reader is actually looking at — including the tab fragment,
 * which is the difference between sending someone "this agent" and sending
 * them "the probe history I want you to see".
 *
 * Uses the platform share sheet where there is one and falls back to the
 * clipboard, which is the honest order: on a phone the sheet is what people
 * expect, and on a desktop it mostly does not exist. Both paths can fail — a
 * dismissed sheet, a denied clipboard, a page served without a secure context
 * — so the button reports what happened rather than claiming success it did
 * not verify.
 */
export function ShareAgent({ name }: { name: string }) {
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2400);
    return () => clearTimeout(timer);
  }, [state]);

  const share = async () => {
    const url = window.location.href;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${name} on Pokter`,
          text: `${name} — the evidence Pokter has measured.`,
          url,
        });
        return;
      } catch (error) {
        /*
         * A cancelled share sheet rejects with AbortError. That is the person
         * deciding not to share, not a failure, and telling them it went wrong
         * would be worse than saying nothing.
         */
        if ((error as Error)?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      return;
    } catch {
      // Falls through: the async clipboard needs a secure context and a
      // permission this page may not have.
    }

    /*
     * The old way, which still works where the new one will not — an insecure
     * origin, an embedded webview, a browser that wants a synchronous call
     * inside the gesture. Deprecated, not dead, and a share control that fails
     * silently is worse than no share control.
     */
    try {
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      setState(copied ? 'copied' : 'failed');
    } catch {
      setState('failed');
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[11px] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]"
    >
      {state === 'idle' && (
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-3.5 shrink-0 fill-none stroke-current"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12M12 3 8 7M12 3l4 4" />
          <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
      )}
      {state === 'idle'
        ? 'Share agent'
        : state === 'copied'
          ? 'Link copied ✓'
          : 'Copy failed'}
    </button>
  );
}
