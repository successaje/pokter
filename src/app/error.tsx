'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-xl flex-col items-start gap-4 pt-16 sm:pt-24">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--negative)]">
        Request interrupted
      </p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Pokter could not finish this check.
      </h1>
      <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
        Registry and protocol reads can fail temporarily. No wallet action was
        submitted by this page. Retry the same check or return to the agent
        marketplace.
      </p>
      {error.digest && (
        <p className="mono text-[10px] text-[color:var(--text-faint)]">
          Reference {error.digest}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={retry}
          className="action-primary rounded-[var(--radius)] px-4 py-2 text-xs font-medium"
        >
          Try again
        </button>
        <Link
          href="/agents"
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-2 text-xs font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          Browse agents
        </Link>
      </div>
    </section>
  );
}
