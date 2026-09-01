import Link from 'next/link';

import {
  getComparison,
  getEcosystemStats,
  listMarketplace,
} from '@/lib/marketplace';
import { ObjectiveSelector } from '@/components/home/ObjectiveSelector';
import { EcosystemPanel } from '@/components/home/EcosystemPanel';
import { CategoryBlocks } from '@/components/home/CategoryBlocks';
import { ClaimVsEvidence } from '@/components/home/ClaimVsEvidence';
import { HowItWorks } from '@/components/home/HowItWorks';
import { Sponsors } from '@/components/brand/Sponsors';
import { Reveal } from '@/components/motion/Reveal';
import { AgentDesk } from '@/components/home/AgentDesk';
import { LiveProof } from '@/components/home/LiveProof';
import { Philosophy } from '@/components/home/Philosophy';
import { Transparency } from '@/components/home/Transparency';
import { buildPipeline, recentProbes } from '@/lib/hero/pipeline';

export const dynamic = 'force-dynamic';

/**
 * The agent used as the claim-versus-evidence exhibit: a well-described
 * liquidation-protection service whose endpoint has never answered a probe.
 * Fetched live, and the section removes itself if that ever stops being true.
 */
const EXHIBIT = { chainId: 56, tokenId: '292058' } as const;

/**
 * Split for per-word motion and broken deliberately across two lines, so the
 * emphasis lands on "deserves" before the eye reaches "your money".
 */
const HEADLINE: string[][] = [
  ['Choose', 'what', 'deserves'],
  ['your', 'money.'],
];

export default async function HomePage() {
  const [stats, sections, exhibit, pipeline] = await Promise.all([
    getEcosystemStats(),
    listMarketplace({ limit: 4 }),
    getComparison(EXHIBIT.chainId, EXHIBIT.tokenId).catch(() => null),
    buildPipeline().catch(() => null),
  ]);

  const probes = recentProbes(5);

  return (
    <div className="flex flex-col gap-20 sm:gap-28">
      {/*
        The hero occupies the viewport so the first screen states one thing.
        Uses svh rather than vh: on mobile, vh is measured against the browser
        chrome's collapsed state, which pushes the next section into view before
        any scrolling has happened — the exact problem this replaces.
      */}
      <section className="flex min-h-[calc(100svh-9rem)] flex-col justify-center gap-10 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
        <div className="flex flex-col gap-7">
          <div className="flex max-w-2xl flex-col gap-5">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
              The decision layer for autonomous finance
            </p>
            {/*
              Animated word by word. The spaces are real text nodes between the
              spans, not CSS margins: margin spacing looks right but leaves the
              accessible text as one run-on word, which is what a screen reader
              would announce.
            */}
            <h1 className="display text-[2.9rem] leading-[0.95] sm:text-6xl lg:text-[4.6rem]">
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
            <p className="max-w-xl text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
              BNB Chain has hundreds of thousands of autonomous agents. Finding
              one was never the hard part. Pokter turns onchain activity,
              attestations and live execution data into evidence you can check —
              then lets you hire with permissions you set and can revoke.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/discover"
              className="rounded-[var(--radius)] bg-[color:var(--text)] px-5 py-2.5 text-[13px] font-medium text-[color:var(--bg)] transition-transform duration-150 hover:-translate-y-0.5"
            >
              Find an agent
            </Link>
            <Link
              href="/methodology"
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              How Pokter scores agents
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {pipeline && <AgentDesk events={pipeline.events} />}
          <p className="text-center text-[11px] leading-relaxed text-[color:var(--text-faint)]">
            Every card is a real event with a real transaction.
          </p>
        </div>
      </section>

      {/* THE SCALE — the number that makes the rest necessary. */}
      <Reveal>
        <EcosystemPanel stats={stats} />
      </Reveal>

      {/* THE PROBLEM — a real agent whose pitch outruns its evidence. */}
      <Reveal>
        <ClaimVsEvidence exhibit={exhibit} />
      </Reveal>

      {/* LIVE PROOF — the check itself, verbatim. */}
      <Reveal>
        <LiveProof probes={probes} />
      </Reveal>

      {/* FOUR FINANCIAL WORLDS. */}
      <Reveal>
        <ObjectiveSelector />
      </Reveal>

      {/* THE EVIDENCE ENGINE, THE DECISION, THE PERMISSION — the loop. */}
      <Reveal>
        <HowItWorks />
      </Reveal>

      <Reveal>
        <CategoryBlocks sections={sections} />
      </Reveal>

      {/* THE STACK. */}
      <Reveal>
        <Sponsors />
      </Reveal>

      {/* TRANSPARENCY — what worked and what fought back. */}
      <Reveal>
        <Transparency />
      </Reveal>

      {/* THE POSITION, then the way in. */}
      <Reveal>
        <Philosophy />
      </Reveal>

      <Reveal>
        <section className="flex flex-col items-center gap-6 py-8 text-center">
          <h2 className="display max-w-3xl text-3xl sm:text-5xl">
            Choose what <span className="swash">deserves</span> your money.
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/discover"
              className="rounded-[var(--radius)] bg-[color:var(--text)] px-5 py-2.5 text-[13px] font-medium text-[color:var(--bg)] transition-transform duration-150 hover:-translate-y-0.5"
            >
              Find an agent
            </Link>
            <Link
              href="/agent-advantage"
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              Does hiring one actually beat doing it yourself?
            </Link>
          </div>
        </section>
      </Reveal>

    </div>
  );
}
