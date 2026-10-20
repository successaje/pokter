'use client';

import { useCallback, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { copyShortcut, copyText } from '@/lib/ui/copy-text';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { Icon } from '@/ui/icons';

/**
 * Sharing a profile: the link, copied or posted.
 *
 * On a phone it opens the system share sheet, which is what people expect
 * there. On a desktop it opens a small panel with the link itself, a copy
 * button and a post to X — the link is visible, so even when the browser
 * refuses the clipboard the person can still select and copy it, and is
 * told how. A click that does nothing visible is never the outcome.
 */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const field = useRef<HTMLInputElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setCopy('idle');
  }, []);
  const layer = useDismissibleLayer<HTMLDivElement>({ open, onDismiss: close });
  const url = () => new URL(path, window.location.origin).toString();

  const trigger = async () => {
    if (open) return close();
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: `${title} on Pokter`, url: url() });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return; // the person closed the sheet
      }
    }
    setOpen(true);
  };

  const copyLink = async () => {
    const ok = await copyText(url());
    setCopy(ok ? 'copied' : 'failed');
    if (ok) window.setTimeout(() => setCopy((c) => (c === 'copied' ? 'idle' : c)), 2000);
    else field.current?.select();
  };

  const postHref = () => `https://x.com/intent/post?${new URLSearchParams({ text: `${title} on Pokter`, url: url() })}`;

  return (
    <div ref={layer} className="relative">
      <button
        type="button"
        onClick={() => void trigger()}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[9px] border border-rule-strong px-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Icon.Share size={14} aria-hidden /> Share
      </button>
      {open && (
        <div role="dialog" aria-label="Share this profile" className="absolute left-0 top-[calc(100%+6px)] z-30 flex w-[min(320px,calc(100vw-32px))] flex-col gap-3 rounded-[14px] border border-rule bg-raised p-3.5 shadow-lift">
          <div className="flex items-center gap-1.5">
            <input
              ref={field}
              readOnly
              value={url()}
              aria-label="Profile link"
              onFocus={(e) => e.currentTarget.select()}
              className="t-readout h-9 min-w-0 flex-1 rounded-[8px] border border-rule bg-sunken px-2.5 text-[12.5px] text-ink-2 outline-none focus:border-ink-3"
            />
            <button
              type="button"
              onClick={() => void copyLink()}
              className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium', copy === 'copied' ? 'bg-ok-wash text-ok' : 'bg-ink text-paper hover:opacity-90')}
            >
              {copy === 'copied' ? <Icon.Check size={14} aria-hidden /> : <Icon.Copy size={14} aria-hidden />}
              {copy === 'copied' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p aria-live="polite" className={cn('text-[12px]', copy === 'failed' ? 'text-watch' : 'sr-only')}>
            {copy === 'failed' ? `This browser blocked copying. The link is selected: press ${copyShortcut()}.` : copy === 'copied' ? 'Link copied.' : ''}
          </p>
          <a
            href={postHref()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-rule-strong text-[13px] font-medium text-ink-2 hover:border-ink-3 hover:text-ink"
          >
            Post on X <Icon.ArrowUpRight size={13} aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}
