'use client';

import Link from 'next/link';
import { HeroBrief } from '@/components/home/HeroBrief';
import { HeroEvidenceBackdrop } from '@/components/home/HeroEvidenceBackdrop';

/**
 * The hero, shared by the live landing page and the two layout previews so a
 * comparison is about structure rather than about which copy got updated.
 *
 * `compact` keeps the proposition and primary actions together without making
 * the landing page wait a full screen before showing marketplace inventory.
 */
const HEADLINE = ['Choose', 'what', 'deserves', 'your', 'money.'] as const;

export function LandingHero({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <section className={`relative isolate flex ${compact ? 'min-h-[calc(100svh-11rem)]' : 'min-h-[calc(100svh-6rem)]'} flex-col items-center justify-center overflow-hidden py-12 text-center sm:py-16`}>
      <HeroEvidenceBackdrop />
      <div className="relative z-10 flex w-full max-w-6xl flex-col items-center gap-7">
        <div className="flex w-full flex-col items-center gap-5">
            <p className="hero-kicker flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/70 px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-[color:var(--text-muted)] backdrop-blur-md sm:text-[11px]">
              <span className="size-1.5 rotate-45 bg-[color:var(--brand)]" aria-hidden />
              The decision layer for autonomous finance on BNB Chain
            </p>
            {/*
              Animated word by word. The spaces are real text nodes between the
              spans, not CSS margins, so assistive technology receives a normal
              sentence. Wide screens keep the statement on one confident line;
              smaller screens wrap naturally rather than shrinking the type.
            */}
            <h1 className="display relative text-[3rem] leading-[0.94] sm:text-6xl lg:whitespace-nowrap lg:text-[clamp(4rem,5.15vw,4.75rem)]">
              <span className="hero-typed-line">
                {HEADLINE.map((word, wordIndex) => (
                  <span key={word}>
                    <span
                      className={word === 'deserves' ? 'word swash' : 'word'}
                      style={{ animationDelay: `${wordIndex * 90}ms` }}
                    >
                      {word}
                    </span>
                    {wordIndex < HEADLINE.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </span>
              <span className="hero-typing-cursor" aria-hidden />
            </h1>
            <p className="hero-copy max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
              Hundreds of thousands of agents claim they work. Pokter calls
              them and publishes what answered, so you hire on evidence — through
              escrow you control, with no authority over your wallet.
            </p>
        </div>

        <div className="hero-actions flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/discover"
              className="rounded-[var(--radius)] bg-[color:var(--brand)] px-5 py-2.5 text-[13px] font-semibold text-[color:var(--brand-ink)] transition-transform duration-150 hover:-translate-y-0.5"
            >
              Find an agent
            </Link>
            <Link
              href="/build"
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              Build an agent
            </Link>
        </div>

        <div className="hero-brief-stage w-full max-w-xl rounded-2xl bg-[color:var(--bg)]/40 p-2 backdrop-blur-[2px]">
          <HeroBrief />
        </div>
      </div>
    </section>
  );
}
