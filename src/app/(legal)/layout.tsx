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
    <div className="flex flex-col gap-8 pt-6">
      <nav
        aria-label="Legal documents"
        className="flex flex-wrap gap-2 border-b border-[color:var(--border)] pb-4"
      >
        {PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="rounded-[var(--radius)] border border-[color:var(--border)] px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]"
          >
            {page.label}
          </Link>
        ))}
      </nav>

      <article className="flex max-w-2xl flex-col gap-6 pb-8 text-sm leading-relaxed text-[color:var(--text-secondary)]">
        {children}
      </article>
    </div>
  );
}
