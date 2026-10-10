'use client';

import { useEffect } from 'react';

import { Button, LinkButton } from '@/ui/Button';

/**
 * The last line of defence for a render failure. It says what happened in
 * plain terms, offers a retry, and never claims an operation succeeded.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[pokter] render failed', error.digest ?? '', error.message);
  }, [error]);

  return (
    <main id="main" className="frame flex min-h-[70vh] flex-col items-start justify-center gap-6 py-24">
      <span className="t-label">Something failed to load</span>
      <h1 className="t-h1 max-w-xl">This page could not be built just now.</h1>
      <p className="t-body max-w-lg text-ink-2">
        Usually a data source (the agent registry or a chain RPC) was slow to answer. Nothing you were doing was submitted
        from this page. Try again, or go back to somewhere that works.
      </p>
      {error.digest && <p className="t-readout text-[12px] text-ink-3">Reference {error.digest}</p>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <LinkButton href="/" intent="secondary">
          Home
        </LinkButton>
      </div>
    </main>
  );
}
