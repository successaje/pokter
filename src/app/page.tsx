import Link from 'next/link';

import {
  getComparison,
  getEcosystemStats,
  listFloor,
  listMarketplace,
} from '@/lib/marketplace';
import { ObjectiveSelector } from '@/components/home/ObjectiveSelector';
import { EcosystemPanel } from '@/components/home/EcosystemPanel';
import { CategoryBlocks } from '@/components/home/CategoryBlocks';
import { ClaimVsEvidence } from '@/components/home/ClaimVsEvidence';
import { HowItWorks } from '@/components/home/HowItWorks';
import { Sponsors } from '@/components/brand/Sponsors';
import { Reveal } from '@/components/motion/Reveal';
import { VerificationFloor } from '@/components/home/VerificationFloor';

export const dynamic = 'force-dynamic';

/**
 * The agent used as the claim-versus-evidence exhibit: a well-described
 * liquidation-protection service whose endpoint has never answered a probe.
 * Fetched live, and the section removes itself if that ever stops being true.
 */
const EXHIBIT = { chainId: 56, tokenId: '292058' } as const;

export default async function HomePage() {
  const [stats, sections, exhibit, floor] = await Promise.all([
    getEcosystemStats(),
    listMarketplace({ limit: 4 }),
    getComparison(EXHIBIT.chainId, EXHIBIT.tokenId).catch(() => null),
    listFloor(16).catch(() => []),
  ]);

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
            <h1 className="display text-[2.5rem] sm:text-6xl lg:text-[4.2rem]">
              Choose what <span className="swash">deserves</span> your money.
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

        <div className="flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-widest text-[color:var(--text-faint)]">
            Live verification floor
          </p>
          <VerificationFloor nodes={floor} />
          <p className="text-[11px] leading-relaxed text-[color:var(--text-faint)]">
            Real agents from the registry, coloured by what our probes actually
            found. Hover any tile.
          </p>
        </div>
      </section>

      <Reveal>
        <ClaimVsEvidence exhibit={exhibit} />
      </Reveal>

      <Reveal>
        <ObjectiveSelector />
      </Reveal>

      <Reveal>
        <HowItWorks />
      </Reveal>

      <Reveal>
        <EcosystemPanel stats={stats} />
      </Reveal>

      <Reveal>
        <CategoryBlocks sections={sections} />
      </Reveal>

      <Reveal>
        <Sponsors />
      </Reveal>
    </div>
  );
}
