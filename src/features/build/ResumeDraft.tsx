'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { draftsServerSnapshot, draftsSnapshot, subscribeToDrafts } from '@/lib/builder/drafts';
import { Icon } from '@/ui/icons';

/**
 * Work in progress comes before a fresh choice.
 *
 * Someone who started an agent and pressed Create agent again usually means
 * to carry on, so their newest draft leads the page. Drafts live in this
 * browser only, which is why this is read here rather than on the server.
 */
export function ResumeDraft() {
  const drafts = useSyncExternalStore(subscribeToDrafts, draftsSnapshot, draftsServerSnapshot);
  const latest = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!latest) return null;
  const name = latest.draft.name.trim() || 'Untitled agent';
  return (
    <Link
      href={`/build/new/guided?draft=${encodeURIComponent(latest.id)}`}
      className="group mb-6 flex items-center justify-between gap-4 rounded-[14px] border border-ink bg-raised px-5 py-4 transition-colors hover:bg-sunken/60"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="t-label">Continue where you left off</span>
        <span className="truncate text-[15px] font-semibold">{name}</span>
        <span className="text-[12.5px] text-ink-3">
          Step {Math.min(latest.step, 3) + 1} of 4 · saved {new Date(latest.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          {drafts.length > 1 ? ` · ${drafts.length - 1} more ${drafts.length - 1 === 1 ? 'draft' : 'drafts'} on Overview` : ''}
        </span>
      </span>
      <Icon.Arrow size={16} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
