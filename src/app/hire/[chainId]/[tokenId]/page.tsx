import Link from 'next/link';
import { notFound } from 'next/navigation';

import { loadDossier } from '@/lib/marketplace';
import { RegistryUnreachable } from '@/components/ui/RegistryUnreachable';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { summarise } from '@/lib/altana/permissions';
import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
import { wbnbUsdPrice } from '@/lib/pancakeswap/pool';
import { recommendedAlternatives } from '@/lib/marketplace';
import { Alternatives } from '@/components/hire/Alternatives';
import { PermissionReview } from '@/components/hire/PermissionReview';
import { EvidenceSection } from '@/components/ui/EvidenceSection';
import { CommissionPanel } from '@/components/hire/CommissionPanel';
import { WalletGate } from '@/components/hire/WalletGate';
import { providerChoicesFor } from '@/lib/erc8183/providers';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import type { ChainId } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';

export default async function HirePage({
  params,
}: {
  params: Promise<{ chainId: string; tokenId: string }>;
}) {
  const { chainId: rawChainId, tokenId } = await params;
  const chainId = Number(rawChainId) as ChainId;
  if (chainId !== 56 && chainId !== 97) notFound();

  /* Absent and unreachable are different answers. See loadDossier. */
  const result = await loadDossier(chainId, tokenId);
  if (result.state === 'missing') notFound();
  if (result.state === 'unreachable') {
    return <RegistryUnreachable chainId={chainId} tokenId={tokenId} />;
  }
  const dossier = result.dossier;

  const { agent, category, proof, live } = dossier;
  const answeredNow = live.ratio !== null && live.ratio > 0;
  const explorerBase = ALTANA_NETWORK.explorer.replace(/\/$/, '');

  // Quoted so a spend cap can be shown in a currency people weigh risk in.
  // A pricing failure must not take the hire page down, so it degrades to no
  // figure rather than to a wrong one.
  const bnbUsdPrice = await wbnbUsdPrice().catch(() => null);
  const meta =
    category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);
  const summary = summarise({
    category,
    spendCapBnb: 0.05,
    period: 'week',
    expiryDays: 7,
  });
  const providers = await providerChoicesFor(agent, ALTANA_NETWORK.chainId);
  const riskWarnings = [
    ...(!proof.recommendedForHire ? [proof.rationale] : []),
    ...(!answeredNow
      ? ['The agent did not answer Pokter’s current live protocol probe.']
      : []),
  ];
  const riskSummary = !proof.recommendedForHire
    ? 'The available evidence does not meet Pokter’s recommendation threshold. Review each warning and explicitly accept the added risk before funding escrow, or choose a stronger alternative below.'
    : 'This agent has a recommendable evidence record, but it did not pass the current live check. Review the fresh warning and explicitly accept the added risk before funding escrow.';

  return (
    <div className="flex flex-col gap-8 pt-6">
      <Link
        href={`/agents/${chainId}/${tokenId}`}
        className="tap self-start text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)] md:self-auto"
      >
        ← Back to agent
      </Link>

      <header className="flex flex-col gap-3 border-b border-[color:var(--border)] pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand)]">
          Hire for a task
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {agent.name}
          </h1>
          {/* FE-06. Labelled, so the verdict is not read as a live status. */}
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
              Evidence
            </span>
            <EvidenceBadge verdict={proof.verdict} size="md" />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
          <span>{meta?.label ?? 'Unclassified'}</span>
          <span aria-hidden>·</span>
          <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1">Identity · BSC mainnet</span>
          <span className="rounded-full border border-[color:var(--info)]/30 bg-[color:var(--info-dim)] px-2.5 py-1 text-[color:var(--info)]">Commission · BSC testnet</span>
        </div>
      </header>

      <div className="flex flex-col gap-8">
          {riskWarnings.length > 0 && (
              <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                <h2 className="text-sm font-medium text-[color:var(--caution)]">
                  Additional review required
                </h2>
                <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
                  {riskSummary}
                </p>
                </div>
                <a href="#alternatives" className="shrink-0 text-[11px] font-medium text-[color:var(--caution)] underline decoration-dotted underline-offset-4">See stronger alternatives</a>
              </section>
          )}
          <WalletGate action="commission work" capability="commission">
            <CommissionPanel
              agent={{
                chainId,
                tokenId,
                name: agent.name,
                category,
                wallet: agent.agent_wallet,
              }}
              providers={providers}
              explorerBase={explorerBase}
              riskWarnings={riskWarnings}
            />
          </WalletGate>

          {riskWarnings.length > 0 && (
            <section id="alternatives" className="scroll-mt-24">
              <Alternatives
                alternatives={await recommendedAlternatives(
                  category === 'unclassified' ? 'health-factor' : category,
                  tokenId,
                )}
                category={category === 'unclassified' ? 'health-factor' : category}
              />
            </section>
          )}

          <EvidenceSection
            title="What hiring does not grant"
            caption="Standing wallet authority remains disabled until every call argument is safely constrained."
            summary="Delegated execution is paused, so this agent gets no access to your wallet."
          >
            <WalletGate action="grant permission" capability="session">
              <PermissionReview
                summary={summary}
                isTestnet={IS_TESTNET}
                bnbUsdPrice={bnbUsdPrice}
              />
            </WalletGate>
          </EvidenceSection>
        </div>
    </div>
  );
}
