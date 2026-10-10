'use client';

import { useState, useSyncExternalStore } from 'react';

import { isAgentSaved, subscribeToSavedAgents, toggleSavedAgent, type SavedAgent } from '@/lib/wallet/saved-agents';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

const iconButton =
  'inline-flex h-9 items-center gap-2 rounded-[8px] border border-rule-strong bg-raised px-3 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink';

/** Saves to this device. Saved agents are re-checked in the background. */
export function SaveButton({ agent, className }: { agent: Omit<SavedAgent, 'savedAt'>; className?: string }) {
  const saved = useSyncExternalStore(
    subscribeToSavedAgents,
    () => isAgentSaved(agent.chainId, agent.tokenId),
    () => false,
  );
  return (
    <button
      type="button"
      onClick={() => toggleSavedAgent(agent)}
      aria-pressed={saved}
      className={cn(iconButton, saved && 'border-ink text-ink', className)}
      title={saved ? 'Saved on this device. Pokter will flag changes to its evidence, availability or price.' : 'Save to watch for changes'}
    >
      {saved ? <Icon.BookmarkFilled size={15} /> : <Icon.Bookmark size={15} />}
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}

export function ShareButton({ title, path, className }: { title: string; path: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn(iconButton, className)}
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        try {
          if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* Dismissed share sheet or blocked clipboard: nothing to report. */
        }
      }}
    >
      {copied ? <Icon.Check size={15} /> : <Icon.Share size={15} />}
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
