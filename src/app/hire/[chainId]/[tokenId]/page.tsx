import type { Metadata } from 'next';
import Link from 'next/link';
import { NETWORK_LABEL, chainLabel } from '@/lib/network/presentation';
import { notFound } from 'next/navigation';

import { loadDossier } from '@/lib/marketplace';
import { RegistryUnreachable } from '@/components/ui/RegistryUnreachable';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { summarise } from '@/lib/altana/permissions';
import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
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

export const metadata: Metadata = {
  title: 'Hire an agent',
  description:
    'Describe a task, review the evidence and fund an ERC-8183 escrow commission on BNB Chain.',
};

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

  const meta =
    category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);

  /*
   * Which chain this agent's identity is on, read from the agent rather than
   * assumed. The catalogue lists chain 56 and chain 97, so a constant here
   * told every testnet agent's buyer that the identity was on mainnet and
   * that two chains were involved when only one was.
   */
  const identityLabel = chainLabel(chainId);
  const summary = summarise({
    category,
    spendCapBnb: 0.05,
    period: 'week',
    expiryDays: 7,
  });
  const providers = await providerChoicesFor(
    agent,
    ALTANA_NETWORK.chainId,
    dossier.quote,
  );
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
        {/*
          Two chains, said as a sentence instead of two chips.

          These were bordered pills, one filled blue, sharing the visual
          language of the tappable outcome chips elsewhere — so they looked
          like controls, did nothing, and explained nothing. A reader saw
          "Identity · BNB Chain" beside a header badge reading "BNB Testnet"
          and had no way to learn that chain 56 is mainnet, that both are
          correct, or why they differ.
        */}
        <div className="flex flex-col gap-1 text-[11px] text-[color:var(--text-muted)]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{meta?.label ?? 'Unclassified'}</span>
            <span aria-hidden>·</span>
            <span>Identity on {identityLabel}</span>
            <span aria-hidden>·</span>
            <span>Escrow on {NETWORK_LABEL}</span>
          </div>
          {identityLabel !== NETWORK_LABEL && (
            <p className="max-w-xl leading-relaxed">
              Two chains on purpose: the agent is registered on{' '}
              {identityLabel}, while the job and its money sit on{' '}
              {NETWORK_LABEL}.
            </p>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-8">
          {riskWarnings.length > 0 && (
              <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                <h2 className="text-sm font-medium text-[color:var(--caution)]">
                  Additional review required
                </h2>
                <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
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
              /*
               * The last price the agent signed, current or not.
               *
               * Quotes lapse fifteen minutes after a sweep captures them, so
               * requiring a live one would mean the default almost never
               * applied and the form would keep falling back to an unrelated
               * flat budget — the behaviour being fixed. The card already
               * shows this number; the two must agree, and the agent's own
               * stale price is a better starting offer than a figure it
               * never named.
               */
              signedQuoteU={dossier.quote ? Number(dossier.quote.priceU) : null}
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
            caption="Pokter will not turn this on until it can constrain every argument of every call the agent could make. Until then there is nothing to configure here."
            summary="This agent is never given your wallet. It writes you an answer; moving money stays yours to do."
            /*
              Shut by default at every width. It grants nothing today, and two
              screens of preview sat open above the escrow the page exists to
              fund — and stayed open after the hire had already happened.
            */
            alwaysCollapsible
          >
            <PermissionReview
              summary={summary}
              isTestnet={IS_TESTNET}
            />
          </EvidenceSection>
        </div>
    </div>
  );
}
