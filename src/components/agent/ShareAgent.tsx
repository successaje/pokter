'use client';

import { useEffect, useState } from 'react';

type State = 'idle' | 'copied' | 'shared' | 'failed';

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

    /*
     * The share sheet is offered only where it is the expected affordance.
     *
     * Chrome on a desktop exposes `navigator.share`, so preferring it whenever
     * it exists routed every desktop click into an OS sheet — and when that
     * sheet did not open, the call rejected with AbortError, which this code
     * read as "the person changed their mind" and answered by doing nothing at
     * all. A button that can do nothing when pressed is worse than one that
     * only ever copies.
     *
     * A coarse pointer is the honest test: it is the device where a sheet is
     * what someone expects and where copying a link is awkward. Everywhere
     * else, copy — it is deterministic, and it is what a link is for.
     */
    const prefersSheet =
      typeof navigator.share === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    if (prefersSheet) {
      try {
        await navigator.share({ title: `${name} on Pokter`, url });
        setState('shared');
        return;
      } catch (error) {
        /*
         * A dismissed sheet is a decision and needs no message. Any other
         * failure falls through to the clipboard rather than ending here,
         * because the press has to produce something.
         */
        if ((error as Error)?.name === 'AbortError') {
          setState('idle');
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      return;
    } catch {
      // Falls through: the async clipboard needs a permission this page may
      // not have, even in a secure context.
    }

    /*
     * The old way, which still works where the new one will not — an embedded
     * webview, a browser that wants a synchronous call inside the gesture.
     * Deprecated, not dead, and the last thing standing between a press and
     * silence.
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

  const message =
    state === 'copied'
      ? 'Link copied'
      : state === 'shared'
        ? 'Shared'
        : state === 'failed'
          ? 'Copy failed'
          : null;

  return (
    <div className="flex items-center gap-2">
      {/*
        The outcome is a label beside the icon rather than a change of icon.
        A tick replacing the glyph says something happened; it does not say
        what, and this control has two outcomes worth telling apart.
      */}
      {message && (
        <span
          className={
            state === 'failed'
              ? 'text-[11px] font-medium text-[color:var(--negative)]'
              : 'text-[11px] font-medium text-[color:var(--positive)]'
          }
        >
          {message}
        </span>
      )}
      <button
        type="button"
        onClick={share}
        title={`Share ${name}`}
        aria-label={`Share ${name}`}
        className="flex size-8 items-center justify-center rounded-full border border-[color:var(--border)] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-4 fill-none stroke-current"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12M12 3 8 7M12 3l4 4" />
          <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
      </button>
      {/* The outcome is announced without the label having to be focused. */}
      <span aria-live="polite" className="sr-only">
        {message ?? ''}
      </span>
    </div>
  );
}
