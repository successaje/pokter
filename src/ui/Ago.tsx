'use client';

import { useSyncExternalStore } from 'react';

/**
 * "4 min ago", kept current while the page is open, with the exact UTC time
 * on hover.
 *
 * Pages are rebuilt every few minutes, so a relative time written on the
 * server would be wrong by as much as the page's own age. The moment is
 * fixed on the server and the distance to it is worked out here; until the
 * page hydrates, the exact time stands in.
 */
const STEP_MS = 30_000;

function subscribe(onChange: () => void): () => void {
  const id = window.setInterval(onChange, STEP_MS);
  return () => window.clearInterval(id);
}

/* Rounded to the step, so the snapshot is the same value between ticks. */
const clock = () => Math.floor(Date.now() / STEP_MS) * STEP_MS;

export function Ago({ at, className }: { at: string; className?: string }) {
  const now = useSyncExternalStore(subscribe, clock, () => null);
  const when = Date.parse(at);
  const exact = `${new Date(when).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  return (
    <time dateTime={at} title={exact} className={className}>
      {now === null ? exact : ago(now - when)}
    </time>
  );
}

export function ago(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
