import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDossier } from '@/lib/marketplace';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { summarise } from '@/lib/altana/permissions';
import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
import { PermissionReview } from '@/components/hire/PermissionReview';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import type { ChainId } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';

/**
 * §30. The staged hire flow.
 *
 * Four stages rather than the six sketched in the brief: review the agent,
 * review what it would be allowed to do, authorize, and see the result. Steps
 * were merged rather than padded — a stage the user clicks through without a
 * decision is friction, not safety.
 */
export default async function HirePage({
  params,
}: {
  params: Promise<{ chainId: string; tokenId: string }>;
}) {
  const { chainId: rawChainId, tokenId } = await params;
  const chainId = Number(rawChainId) as ChainId;
  if (chainId !== 56 && chainId !== 97) notFound();

  const dossier = await getDossier(chainId, tokenId).catch(() => null);
  if (!dossier) notFound();

  const { agent, category, proof } = dossier;
  const meta = category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);
  const summary = summarise({
    category,
    spendCapBnb: 0.05,
    period: 'week',
    expiryDays: 7,
  });

  return (
    <div className="flex flex-col gap-8 pt-6">
      <Link
        href={`/agents/${chainId}/${tokenId}`}
        className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
      >
        ← Back to agent
      </Link>

      <header className="flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-widest text-[color:var(--text-muted)]">
          Hire
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
          <EvidenceBadge verdict={proof.verdict} size="md" />
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
          {meta?.label ?? 'Unclassified'} · Review exactly what this agent would
          be allowed to do before you grant anything.
        </p>
      </header>

      {!proof.hirable ? (
        <section className="rounded-[var(--radius-lg)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-5">
          <h2 className="text-sm font-medium text-[color:var(--negative)]">
            Hiring is blocked
          </h2>
          <p className="mt-1.5 max-w-2xl text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
            {proof.rationale}
          </p>
        </section>
      ) : (
        <PermissionReview
          summary={summary}
          agent={{
            chainId,
            tokenId,
            name: agent.name,
            category: category === 'unclassified' ? 'health-factor' : category,
          }}
          explorerBase={ALTANA_NETWORK.explorer.replace(/\/$/, '')}
          isTestnet={IS_TESTNET}
        />
      )}
    </div>
  );
}
