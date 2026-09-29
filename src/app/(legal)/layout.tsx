import Link from 'next/link';

const PAGES = [
  { href: '/terms', label: 'Terms of use' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/risk', label: 'Risk disclosure' },
] as const;

/**
 * Shared frame for the three documents a marketplace that moves money owes a
 * visitor before they move any.
 *
 * Written in the product's own voice rather than adapted boilerplate. A
 * generic template would describe custody Pokter does not take, data it does
 * not collect and guarantees it cannot make — which is the same failure the
 * rest of the product exists to correct, committed in the one place a reader
 * is most entitled to a straight answer.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 pt-6">
      {/*
        A way back, first.
        
        These pages are reached from a footer link at the bottom of a long
        page, and they are short — a reader who arrives, finds their answer and
        then has nowhere to go but the browser's back button has been handed a
        dead end by the one part of the product whose job is to be clear.
      */}
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-[12px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
      >
        <span aria-hidden>←</span> Back to Pokter
      </Link>

      <nav
        aria-label="Legal documents"
        className="flex flex-wrap gap-2 border-b border-[color:var(--border)] pb-4"
      >
        {PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="rounded-[var(--radius)] border border-[color:var(--border)] px-3.5 py-2 text-[12px] font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
          >
            {page.label}
          </Link>
        ))}
      </nav>

      <article className="flex max-w-[65ch] flex-col gap-5 pb-12 text-[15px] leading-[1.75] text-[color:var(--text-secondary)]">
        {children}

        <footer className="mt-4 flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] pt-6 text-[12px]">
          <span className="text-[color:var(--text-faint)]">Also worth reading:</span>
          {PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="text-[color:var(--info)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              {page.label}
            </Link>
          ))}
          <Link
            href="/methodology"
            className="text-[color:var(--info)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            Methodology
          </Link>
        </footer>
      </article>
    </div>
  );
}
