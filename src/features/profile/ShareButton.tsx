'use client';

import { useState } from 'react';

import { Icon } from '@/ui/icons';

/** Shares the profile's address: the system share sheet where there is one, otherwise a copied link. */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} on Pokter`, url });
        return;
      }
    } catch {
      /* Cancelled or unavailable: fall back to copying. */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard blocked: nothing else to try. */
    }
  };
  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-rule-strong px-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Icon.Share size={14} aria-hidden /> <span aria-live="polite">{copied ? 'Link copied' : 'Share'}</span>
    </button>
  );
}
