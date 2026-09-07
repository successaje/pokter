'use client';

import { useState } from 'react';

import type { Rejection } from '@/lib/recommend/types';

/**
 * §26. The rejections.
 *
 * Showing what was ruled out, and on what grounds, is what separates a
 * recommendation from a ranking. Each reason is a fact about the agent that the
 * user could go and check themselves.
 *
 * It sits directly beneath the summary rather than below the matches. Placed
 * after them it sat two screens down, which quietly made the rejections
 * optional reading — the opposite of the claim the page opens with.
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
        className="flex w-full cursor-pointer items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-[color:var(--surface-hover)]"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {/*
            A chevron, because the control read as a heading without one: it is
            a button, but nothing about it looked pressable.
          */}
          <span
            aria-hidden
            className="inline-block text-[color:var(--text-muted)] transition-transform duration-200"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          >
            ›
          </span>
          Why not the others?
        </span>
        <span className="rounded-full border border-[color:var(--border-strong)] px-2 py-0.5 text-[11px] text-[color:var(--text-muted)]">
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
