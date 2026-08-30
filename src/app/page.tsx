import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { listMarketplace } from '@/lib/marketplace';
import { CategoryRail } from '@/components/CategoryRail';

// The registry moves constantly; revalidate rather than build once.
export const revalidate = 120;

export default async function MarketplacePage() {
  const sections = await listMarketplace({ limit: 4 });

  const listed = sections.reduce((sum, s) => sum + s.listings.length, 0);
  const withRecord = sections.reduce(
    (sum, s) => sum + s.listings.filter((l) => l.attestationCount > 0).length,
    0,
  );

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h1 className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          You cannot hire an agent here until you have watched it work.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--muted)]">
          The BNB Chain agent registry holds hundreds of thousands of agents, and
          almost none of them can show you a record. Proving Ground reads every
          claim back to an on-chain attestation, probes each agent live before you
          delegate anything, and refuses to rank an agent it cannot verify.
        </p>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 pt-1 text-xs text-[color:var(--muted-dim)]">
          <div className="flex items-baseline gap-2">
            <dt>Listed</dt>
            <dd className="tabular text-[color:var(--foreground)]">{listed}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt>Carrying any on-chain record</dt>
            <dd className="tabular text-[color:var(--foreground)]">{withRecord}</dd>
          </div>
        </dl>
      </section>

      {sections.map(({ category, listings }) => {
        const meta = CATEGORY_BY_ID.get(category);
        if (!meta) return null;
        return <CategoryRail key={category} meta={meta} listings={listings} />;
      })}
    </div>
  );
}
