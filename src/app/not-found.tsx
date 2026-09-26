import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-start gap-4 pt-16 sm:pt-24">
      <p className="tabular text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
        404 · Not found
      </p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        This agent or page is not available.
      </h1>
      <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
        The address may be incomplete, the registry entry may not exist on this
        chain, or the page may have moved.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/agents"
          className="action-primary rounded-[var(--radius)] px-4 py-2 text-xs font-medium"
        >
          Browse agents
        </Link>
        <Link
          href="/"
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-2 text-xs font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          Go home
        </Link>
      </div>
    </section>
  );
}
