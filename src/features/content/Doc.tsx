import type { ReactNode } from 'react';

/**
 * The frame for reading pages: a quiet header, an optional table of
 * contents that stays put on wide screens, and a single readable column.
 */
export function Doc({
  label,
  title,
  lede,
  toc,
  children,
  aside,
}: {
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  toc?: Array<{ id: string; label: string }>;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="frame pb-24 pt-10 sm:pt-16">
      <header className="mb-12 flex max-w-3xl flex-col gap-4">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> {label}
        </span>
        <h1 className="t-h1">{title}</h1>
        {lede && <p className="t-lede">{lede}</p>}
      </header>
      <div className={toc ? 'grid gap-12 lg:grid-cols-[200px_minmax(0,1fr)]' : ''}>
        {toc && (
          <nav aria-label="On this page" className="hidden lg:block">
            <ol className="sticky top-24 flex flex-col gap-1 border-l border-rule text-[13px]">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-ink-3 hover:border-ink hover:text-ink">
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex min-w-0 max-w-3xl flex-col gap-16">{children}</div>
        {aside}
      </div>
    </div>
  );
}

export function DocSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 flex flex-col gap-4">
      <h2 id={`${id}-h`} className="t-h2">
        {title}
      </h2>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </section>
  );
}
