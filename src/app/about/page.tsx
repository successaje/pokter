import type { Metadata } from 'next';
import Link from 'next/link';

import { Integrations } from '@/components/brand/Integrations';
import { Transparency } from '@/components/home/Transparency';
import { Philosophy } from '@/components/home/Philosophy';
import { Reveal } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'How it is built',
  description:
    'Every integration Pokter depends on, written up with the errors it produced, and the things Pokter refuses to estimate.',
};

/**
 * The case, moved off the landing page.
 *
 * These three sections are the product's argument about itself rather than its
 * offer to a visitor, and on the landing page they sat four screens below a
 * marketplace someone had arrived to browse. Relocating them is not a demotion:
 * an integration list that names its own failures is the most unusual thing
 * here, and it reads better with room than as the tail of a longer page.
 */
export default function AboutPage() {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-[12px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
      >
        <span aria-hidden>←</span> Back to Pokter
      </Link>

      <header className="flex max-w-2xl flex-col gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">
          How it is built
        </p>
        <h1 className="display text-3xl sm:text-5xl">
          What worked, and what fought back.
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
          Every integration Pokter depends on, written up with the exact errors
          it produced rather than quietly dropped. A page that lists only
          successes is a claim; one that names its failures is a report.
        </p>
      </header>

      <div className="flex flex-col gap-16 pt-6 sm:gap-20">
      <Reveal>
        <Integrations />
      </Reveal>

      <Reveal>
        <Transparency />
      </Reveal>

      <Reveal>
        <Philosophy />
      </Reveal>

      <Reveal>
        <section className="flex flex-col items-center gap-5 py-4 text-center">
          <h2 className="display max-w-2xl text-2xl sm:text-3xl">
            The rules are written down so you can disagree with them.
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/methodology"
              className="rounded-[var(--radius)] bg-[color:var(--brand)] px-5 py-2.5 text-[13px] font-semibold text-[color:var(--brand-ink)]"
            >
              Read the methodology
            </Link>
            <Link
              href="/discover"
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              Find an agent
            </Link>
          </div>
        </section>
      </Reveal>
      </div>
    </div>
  );
}
