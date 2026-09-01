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

export const dynamic = 'force-dynamic';

/**
 * The agent used as the claim-versus-evidence exhibit: a well-described
 * liquidation-protection service whose endpoint has never answered a probe.
 * Fetched live, and the section removes itself if that ever stops being true.
 */
const EXHIBIT = { chainId: 56, tokenId: '292058' } as const;

export default async function HomePage() {
  const [stats, sections, exhibit] = await Promise.all([
    getEcosystemStats(),
    listMarketplace({ limit: 4 }),
    getComparison(EXHIBIT.chainId, EXHIBIT.tokenId).catch(() => null),
  ]);

  return (
    <div className="flex flex-col gap-20 sm:gap-28">
      <section className="flex flex-col gap-7 pt-8 sm:pt-16">
        <div className="flex max-w-4xl flex-col gap-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
            The decision layer for autonomous finance
          </p>
          <h1 className="display text-[2.5rem] sm:text-6xl lg:text-7xl">
            Choose what <span className="swash">deserves</span> your money.
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
            BNB Chain has hundreds of thousands of autonomous agents. Finding one
            was never the hard part. Pokter turns onchain activity, attestations
            and live execution data into evidence you can check — then lets you
            hire with permissions you set and can revoke.
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
      </section>

      <ClaimVsEvidence exhibit={exhibit} />

      <ObjectiveSelector />

      <HowItWorks />

      <EcosystemPanel stats={stats} />

      <CategoryBlocks sections={sections} />

      <Sponsors />
    </div>
  );
}
