'use client';

import { useEffect } from 'react';

import { Button, LinkButton } from '@/ui/Button';

/**
 * The last line of defence for a render failure. It says what happened in
 * plain terms, offers a retry, and never claims an operation succeeded.
 *
 * Nor that one did not. It used to tell every visitor that nothing they
 * were doing had been submitted, whatever the page was, and a hire that
 * broke after the wallet had approved a step had submitted something: the
 * buyer, told otherwise, tried again. It checks nothing, so it promises nothing, and points to the
 * wallet's own activity and the buyer's hires instead. "A data source was
 * slow" went too: it was a guess presented as the reason.
 *
 * The error itself is shown, folded, and sent to the server log
 * (`/api/client-errors`): a failure in the browser otherwise leaves no
 * trace anywhere Pokter can read.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[pokter] render failed', error.digest ?? '', error.message);
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: error.message, digest: error.digest ?? null, path: window.location.pathname, stack: error.stack ?? null }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <main id="main" className="frame flex min-h-[70vh] flex-col items-start justify-center gap-6 py-24">
      <span className="t-label">Something went wrong</span>
      <h1 className="t-h1 max-w-xl">This page stopped working.</h1>
      <p className="t-body max-w-lg text-ink-2">
        If you were approving something in your wallet when it stopped, that step may still have gone through. Check your wallet&rsquo;s activity, and your hires, before you try again.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <LinkButton href="/workspace" intent="secondary">
          Your hires
        </LinkButton>
        <LinkButton href="/" intent="ghost">
          Home
        </LinkButton>
      </div>
      <details className="max-w-lg text-[12.5px] text-ink-3">
        <summary className="cursor-pointer">What went wrong, for a bug report</summary>
        <p className="t-readout mt-2 break-words">{error.message || 'No message.'}</p>
        {error.digest && <p className="t-readout mt-1">Reference {error.digest}</p>}
      </details>
    </main>
  );
}
