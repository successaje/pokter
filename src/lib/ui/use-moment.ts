'use client';

import { useEffect, useState } from 'react';

/**
 * A deadline that arrives without a reload.
 *
 * `useNow` freezes at mount, which is right for formatting a timestamp and
 * wrong for a moment something becomes possible: a review window closing
 * does not change a job's on-chain status, so nothing re-renders, and the
 * page kept saying "in 40 seconds" forty minutes later. The buyer or
 * seller had to reload to find out they could act.
 *
 * One timeout per moment rather than a ticking clock. A one-second
 * interval would re-render every open job every second for the hours a
 * mainnet window lasts, to change nothing until the last tick.
 */

/**
 * How long to wait before the moment, in milliseconds, or null when there
 * is nothing to wait for.
 *
 * Clamped to a day. `setTimeout` stores its delay in a signed 32-bit int,
 * so anything past ~24.9 days wraps and fires immediately — a mainnet
 * expiry is well inside that, but a job with a nonsense deadline would
 * otherwise flip the UI the instant it loaded.
 */
export const MAX_WAIT_MS = 24 * 60 * 60_000;

export function msUntil(atSeconds: number | null, nowMs: number): number | null {
  if (atSeconds === null || !Number.isFinite(atSeconds)) return null;
  const waitMs = atSeconds * 1000 - nowMs;
  if (waitMs <= 0) return null;
  return Math.min(waitMs, MAX_WAIT_MS);
}

/**
 * A clock that is frozen, except that it jumps once as the moment passes.
 *
 * A time rather than a boolean, so callers keep reading a value they were
 * handed instead of calling `Date.now()` while rendering — which is
 * impure, and is why `useNow` freezes it in the first place.
 */
export function useClockThrough(atSeconds: number | null): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const waitMs = msUntil(atSeconds, Date.now());
    if (waitMs === null) return;
    /*
     * +250ms so the re-render lands after the moment rather than on it.
     * Firing exactly on the boundary re-renders into a state that is
     * still "not yet" by a millisecond, and nothing schedules again.
     */
    const timer = setTimeout(() => setNowMs(Date.now()), waitMs + 250);
    return () => clearTimeout(timer);
  }, [atSeconds]);

  return nowMs;
}
