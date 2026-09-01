'use client';

import { useState } from 'react';

import type { Rejection } from '@/lib/recommend/types';

/**
 * §26. The rejections.
 *
 * Showing what was ruled out, and on what grounds, is what separates a
 * recommendation from a ranking. Each reason is a fact about the agent that the
 * user could go and check themselves.
 */
export function WhyNot({ rejected }: { rejected: Rejection[] }) {
  const [open, setOpen] = useState(false);

  if (rejected.length === 0) return null;

  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-[color:var(--surface-hover)]"
      >
        <span className="text-sm font-medium">Why not the others?</span>
        <span className="text-[11px] text-[color:var(--text-muted)]">
          {rejected.length} ruled out · {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <ul className="flex flex-col divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
          {rejected.map(({ listing, reason }) => (
            <li
              key={listing.agent.token_id}
              className="flex flex-col gap-1 px-4 py-3"
            >
              <span className="text-[13px] font-medium">{listing.agent.name}</span>
              <span className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                {reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
