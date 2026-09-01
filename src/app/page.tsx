import Link from 'next/link';

import { getEcosystemStats, listMarketplace } from '@/lib/marketplace';
import { ObjectiveSelector } from '@/components/home/ObjectiveSelector';
import { EcosystemPanel } from '@/components/home/EcosystemPanel';
import { CategoryBlocks } from '@/components/home/CategoryBlocks';

/**
 * Rendered per request rather than pre-built.
 *
 * Static generation ran each page in its own worker with no shared fetch cache,
 * so every page independently re-queried a rate-limited registry and the build
 * repeatedly blew past its 60s budget. Pre-rendering bought little anyway: this
 * data is live and revalidates every two minutes regardless.
 *
 * Responses are still cached at the fetch layer, so only the first request
 * after a revalidation window pays for the lookup. Setting SCAN_API_KEY lifts
 * the rate limit from 30 to 3,000 requests a minute and makes this moot.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [stats, sections] = await Promise.all([
    getEcosystemStats(),
    listMarketplace({ limit: 4 }),
  ]);

  return (
    <div className="flex flex-col gap-14">
      <section className="flex flex-col gap-6 pt-6">
        <div className="flex max-w-3xl flex-col gap-4">
          <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Choose what deserves your money.
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
            Compare autonomous financial agents using onchain activity,
            reputation, performance, risk and live execution data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/discover"
            className="rounded-[var(--radius)] bg-[color:var(--text)] px-4 py-2 text-[13px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90"
          >
            Explore agents
          </Link>
          <Link
            href="/methodology"
            className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-2 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
          >
            See how Pokter scores agents
          </Link>
        </div>
      </section>

      <ObjectiveSelector />
      <EcosystemPanel stats={stats} />
      <CategoryBlocks sections={sections} />
    </div>
  );
}
