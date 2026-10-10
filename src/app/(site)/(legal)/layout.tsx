import Link from 'next/link';

const PAGES = [
  { href: '/terms', label: 'Terms of use' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/risk', label: 'Risk disclosure' },
] as const;

/**
 * The three documents a marketplace that moves money owes a visitor before
 * they move any, in the product's own voice rather than adapted boilerplate.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="frame grid gap-10 py-12 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Legal" className="flex gap-2 md:sticky md:top-24 md:flex-col md:self-start">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} className="rounded-[8px] px-3 py-2 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
            {p.label}
          </Link>
        ))}
      </nav>
      <article className="flex max-w-[68ch] flex-col gap-4 text-[15px] leading-relaxed text-ink-2">{children}</article>
    </div>
  );
}
