'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Whether Pokter itself is up, said where a footer says it.
 *
 * Deliberately narrow. `/api/health` checks that Pokter's own stores are
 * writable and persistent — the probe history, the job index, the
 * deliverables. That is worth stating, and it is the only thing stated:
 * it is not a claim about BNB Chain, about any escrow, or about whether
 * the agents are answering, none of which this endpoint looks at and all
 * of which a reader could reasonably hear in "all systems operational".
 *
 * The line links to the endpoint, so the claim is checkable in one click
 * by the people most likely to doubt it. A footer badge nobody can verify
 * is the kind of thing this product exists not to publish.
 *
 * Unknown is its own state. A failed fetch says so rather than showing
 * green, because a status light that cannot go out is decoration.
 */
type Health = 'checking' | 'ok' | 'degraded' | 'unknown';

const TONE: Record<Health, { dot: string; ping: string; text: string }> = {
  checking: { dot: 'bg-rule-strong', ping: '', text: 'Checking status' },
  ok: { dot: 'bg-ok', ping: 'bg-ok', text: 'All systems operational' },
  degraded: { dot: 'bg-watch', ping: 'bg-watch', text: 'Degraded: some stores are not writable' },
  unknown: { dot: 'bg-rule-strong', ping: '', text: 'Status unavailable' },
};

export function FooterStatus() {
  const [state, setState] = useState<Health>('checking');

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/health', { signal: abort.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { status?: unknown }) => setState(body?.status === 'ok' ? 'ok' : 'degraded'))
      .catch((error: unknown) => {
        // An aborted fetch is this component unmounting, not a failure.
        if (!abort.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) setState('unknown');
      });
    return () => abort.abort();
  }, []);

  const tone = TONE[state];
  return (
    <Link
      href="/api/health"
      className="inline-flex w-fit items-center gap-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
      title="Pokter’s own storage health, as the endpoint reports it"
    >
      <span className="relative grid size-2.5 place-items-center" aria-hidden>
        {tone.ping && (
          <span className={`absolute inline-flex size-2.5 animate-ping rounded-full opacity-60 ${tone.ping} motion-reduce:hidden`} />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${tone.dot}`} />
      </span>
      {tone.text}
    </Link>
  );
}
