import Link from 'next/link';

import {
  getComparison,
  getEcosystemStats,
  listMarketplace,
} from '@/lib/marketplace';
import { ObjectiveSelector } from '@/components/home/ObjectiveSelector';
import { EcosystemPanel } from '@/components/home/EcosystemPanel';
import { ClaimVsEvidence } from '@/components/home/ClaimVsEvidence';
import { HowItWorks } from '@/components/home/HowItWorks';
import { Reveal } from '@/components/motion/Reveal';
import { LandingHero } from '@/components/home/LandingHero';
import { LiveProof } from '@/components/home/LiveProof';
import { buildPipeline, recentProbes } from '@/lib/hero/pipeline';

export const dynamic = 'force-dynamic';

/**
 * The agent used as the claim-versus-evidence exhibit: a well-described
 * liquidation-protection service whose endpoint has never answered a probe.
 * Fetched live, and the section removes itself if that ever stops being true.
 */
const EXHIBIT = { chainId: 56, tokenId: '292058' } as const;

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
        Compact rather than full-viewport. The page now leads with browsing, so
        the first scroll has to reach agents; a hero holding the whole screen
        put the marketplace two screens further away than the argument needed.
      */}
      <LandingHero pipeline={pipeline} compact />

      {/*
        Browsing first. A visitor arriving at a marketplace is looking for
        agents, and the argument for why these agents can be believed reads
        better as the answer to a question they have already started asking
        than as a prologue to one they have not.
      */}
      <Reveal>
        <ObjectiveSelector sections={sections} />
      </Reveal>

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

      {/* THE EVIDENCE ENGINE, THE DECISION, THE PERMISSION — the loop. */}
      <Reveal>
        <HowItWorks />
      </Reveal>




      {/*
        The relocated sections are signposted rather than silently dropped.
        Removing the evidence of our own limits with no route to it would be
        the one edit this product cannot defend.
      */}
      <Reveal>
        <section className="flex flex-col items-center gap-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-8 text-center">
          <h2 className="display max-w-3xl text-2xl sm:text-3xl">
            What we build on, and what fought back.
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
            Every integration, written up with the errors it produced, and the
            list of things Pokter refuses to estimate.
          </p>
          <Link
            href="/about"
            className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
          >
            Read how it is built →
          </Link>
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col items-center gap-6 py-8 text-center">
          <h2 className="display max-w-3xl text-3xl sm:text-5xl">
            Choose what <span className="swash">deserves</span> your money.
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/discover"
              className="rounded-[var(--radius)] bg-[color:var(--brand)] px-5 py-2.5 text-[13px] font-semibold text-[color:var(--brand-ink)] transition-transform duration-150 hover:-translate-y-0.5"
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
