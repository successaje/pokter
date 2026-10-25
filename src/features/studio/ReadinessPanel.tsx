'use client';

import { useState, useSyncExternalStore } from 'react';

import { builderReadinessMilestones, type BuilderLifecycle } from '@/lib/diagnostic/builder-lifecycle';
import type { DiagnosticReport } from '@/lib/diagnostic/checks';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { Readiness, ReadinessSkeleton } from './Readiness';

type Reading = DiagnosticReport & { lifecycle?: BuilderLifecycle };

interface Cached {
  observedAt: string;
  lifecycle: BuilderLifecycle;
}

function cacheKey(chainId: number, tokenId: string) {
  return `pokter-readiness-v1:${chainId}:${tokenId}`;
}

/*
 * The last reading, kept on this device.
 *
 * The checks cost several outbound calls against the builder's own
 * endpoint, so they run when asked rather than on every page load — which
 * means a reload, a wallet that reloads the tab when it switches network,
 * or a dropped connection would otherwise return somebody to an empty
 * panel and make them pay for the checks again. The reading is dated on
 * screen so an old one cannot be mistaken for a fresh one.
 */
const READINESS_EVENT = 'pokter:readiness';

/*
 * Read as an external store, the shape this codebase already uses for
 * drafts and jobs: localStorage is shared mutable state outside React, so
 * it is subscribed to rather than copied in by an effect. The snapshot is
 * cached against the raw string because `useSyncExternalStore` compares by
 * identity — parsing afresh on every call would hand React a new object
 * each time and spin. The server has no storage, so it renders the
 * never-checked state and hydration matches it.
 */
let snapshotKey = '';
let snapshotSource: string | null = null;
let snapshotValue: Cached | null = null;

function subscribeToReading(listener: () => void): () => void {
  window.addEventListener(READINESS_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(READINESS_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

function readingSnapshot(key: string): Cached | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (key === snapshotKey && raw === snapshotSource) return snapshotValue;
    snapshotKey = key;
    snapshotSource = raw;
    const parsed = raw ? (JSON.parse(raw) as Cached) : null;
    snapshotValue = parsed && parsed.lifecycle && parsed.observedAt ? parsed : null;
    return snapshotValue;
  } catch {
    return null;
  }
}

function writeReading(key: string, value: Cached): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(READINESS_EVENT));
    return true;
  } catch {
    /* Then the reading lasts this render, which is still better than losing it. */
    return false;
  }
}

function age(observedAt: string): string {
  const ms = Date.now() - Date.parse(observedAt);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The six readiness milestones for one agent, run when asked.
 *
 * Not on page load: each run costs several outbound requests against the
 * builder's own endpoint and a quote negotiation, and the route is rate
 * limited for exactly that reason. So this is the builder pressing a
 * button, with the last reading kept on the device and dated, rather than
 * a page that hammers somebody's server every time it is refreshed.
 *
 * Every state is a state somebody will see: never run, running, failed,
 * rate limited, and a reading from an hour ago that is still the most
 * recent thing Pokter knows.
 */
export function ReadinessPanel({
  chainId,
  tokenId,
}: {
  chainId: number;
  tokenId: string;
}) {
  const key = cacheKey(chainId, tokenId);
  const stored = useSyncExternalStore(
    subscribeToReading,
    () => readingSnapshot(key),
    () => null,
  );
  /* The reading when storage would not take it — full, blocked, or a
     private window. Losing the reading to that would mean paying for the
     checks again. */
  const [unsaved, setUnsaved] = useState<Cached | null>(null);
  const cached = stored ?? unsaved;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setRetryAfter(null);
    try {
      const response = await fetch('/api/compatibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId, tokenId }),
      });
      const body = (await response.json().catch(() => ({}))) as Reading & { error?: string };
      if (response.status === 429) {
        setRetryAfter(Number(response.headers.get('retry-after')) || 60);
        throw new Error('Too many checks from this connection.');
      }
      if (!response.ok || !body.lifecycle) throw new Error(body.error ?? 'The checks could not be completed.');
      const value: Cached = { observedAt: body.observedAt ?? new Date().toISOString(), lifecycle: body.lifecycle };
      setUnsaved(writeReading(key, value) ? null : value);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (busy && !cached) {
    return (
      <div className="flex flex-col gap-4">
        <ReadinessSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {cached ? (
        <>
          <Readiness
            milestones={builderReadinessMilestones(cached.lifecycle, { chainId, tokenId })}
            onRetest={() => void run()}
            busy={busy}
            title="Readiness, six milestones"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="s" intent="secondary" busy={busy} onClick={() => void run()} icon={<Icon.Refresh size={14} />}>
              Run the checks again
            </Button>
            <span className="text-[12.5px] text-ink-3">
              Read {age(cached.observedAt)}.{' '}
              {stored
                ? 'Kept on this device, so a reload does not lose it or re-run the checks.'
                : 'This browser would not save it, so leaving the page loses the reading.'}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-rule-strong p-5">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Readiness has not been checked on this device</p>
            <p className="max-w-xl text-[13px] leading-relaxed text-ink-2">
              Pokter will call your endpoint the way a buyer&rsquo;s hire does, ask it for a signed price, and read this
              agent&rsquo;s funded jobs from escrow. Each run costs several requests against your own server, so it happens
              when you ask rather than on every page load.
            </p>
          </div>
          <Button size="s" busy={busy} onClick={() => void run()} icon={<Icon.Pulse size={14} />}>
            Run the six checks
          </Button>
        </div>
      )}

      {error && (
        <Notice
          tone="watch"
          title="The checks did not run"
          action={
            <Button size="s" intent="secondary" busy={busy} onClick={() => void run()}>
              Try again
            </Button>
          }
        >
          {error}
          {retryAfter ? ` Wait about ${retryAfter} seconds — each run calls your endpoint several times.` : ''}
          {cached ? ' The reading above is the last one Pokter took and still stands.' : ''}
        </Notice>
      )}
    </div>
  );
}
