'use client';

import Link from 'next/link';
import { HeroBrief } from '@/components/home/HeroBrief';
import { HeroEvidenceBackdrop } from '@/components/home/HeroEvidenceBackdrop';

/**
 * The hero, shared by the live landing page and the two layout previews so a
 * comparison is about structure rather than about which copy got updated.
 *
 * `compact` still holds the first screen, just less of it. The hero has one
 * job — say the single thing this product is for — and a next section already
 * peeking under it steals that. What compact buys is the section starting
 * immediately after the fold rather than a screen below it, so one scroll
 * reaches the marketplace.
 */
const HEADLINE: string[][] = [
  ['Choose', 'what', 'deserves'],
  ['your', 'money.'],
];

export function LandingHero({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <section className={`relative isolate flex ${compact ? 'min-h-[calc(100svh-8rem)]' : 'min-h-[calc(100svh-6rem)]'} flex-col items-center justify-center overflow-hidden py-16 text-center sm:py-20`}>
      <HeroEvidenceBackdrop />
      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center gap-7">
          <div className="flex max-w-3xl flex-col items-center gap-5">
            <p className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/70 px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-[color:var(--text-muted)] backdrop-blur-md sm:text-[11px]">
              <span className="size-1.5 rotate-45 bg-[color:var(--brand)]" aria-hidden />
              The decision layer for autonomous finance on BNB Chain
            </p>
            {/*
              Animated word by word. The spaces are real text nodes between the
              spans, not CSS margins: margin spacing looks right but leaves the
              accessible text as one run-on word, which is what a screen reader
              would announce.
            */}
            <h1 className="display text-[3rem] leading-[0.94] sm:text-6xl lg:text-[5.35rem]">
              {HEADLINE.map((line, lineIndex) => (
                <span key={lineIndex}>
                  <span className="block">
                  {line.map((word, wordIndex) => {
                    const order = lineIndex * 3 + wordIndex;
                    return (
                      <span key={word}>
                        <span
                          className={word === 'deserves' ? 'word swash' : 'word'}
                          style={{ animationDelay: `${order * 90}ms` }}
                        >
                          {word}
                        </span>
                        {wordIndex < line.length - 1 ? ' ' : ''}
                      </span>
                    );
                  })}
                  </span>
                  {/* Separates the lines for readers; the block break handles
                      it visually. */}
                  {lineIndex < HEADLINE.length - 1 ? ' ' : ''}
                </span>
              ))}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
              Hundreds of thousands of agents claim they work. Pokter calls
              them and publishes what answered, so you hire on evidence — through
              escrow you control, with no authority over your wallet.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
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

          <div className="w-full max-w-xl rounded-2xl bg-[color:var(--bg)]/40 p-2 backdrop-blur-[2px]">
            <HeroBrief />
          </div>
      </div>
    </section>
  );
}
