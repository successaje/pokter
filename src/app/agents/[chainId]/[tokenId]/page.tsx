import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { getDossier } from '@/lib/marketplace';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import type { ChainId } from '@/lib/scan/types';

import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { ScorePanel } from '@/components/ui/Score';
import { TrustPanel } from '@/components/agent/TrustPanel';
import { PerformancePanel } from '@/components/agent/PerformancePanel';
import { TrackRecordPanel } from '@/components/TrackRecordPanel';
import { LivePanel } from '@/components/LivePanel';
import { EvidencePanel } from '@/components/EvidencePanel';
import { AuthorityPanel } from '@/components/AuthorityPanel';

/** The live probe is taken per request, so this page is never cached. */
export const dynamic = 'force-dynamic';

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium tracking-tight">{title}</h2>
        <p className="text-xs text-[color:var(--text-muted)]">{caption}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * §20. The agent dossier.
 *
 * Ordered by the question a user actually asks, in order: what is this, can it
 * be trusted, what has it done, and only then what would hiring it grant. The
 * Pokter Score sits near the top but is never the last word — the panels below
 * it are the working, and the score links back to them.
 */
export default async function AgentPage({
  params,
}: {
  params: Promise<{ chainId: string; tokenId: string }>;
}) {
  const { chainId: rawChainId, tokenId } = await params;
  const chainId = Number(rawChainId) as ChainId;
  if (chainId !== 56 && chainId !== 97) notFound();

  const dossier = await getDossier(chainId, tokenId).catch(() => null);
  if (!dossier) notFound();

  const { agent, category, attestations, proof, live, record, score } = dossier;
  const meta = category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);
  const explorerBase = ALTANA_NETWORK.explorer.replace(/\/$/, '');
  const answeredNow = live.ratio !== null && live.ratio > 0;

  const knownDefects = [
    ...new Set([...(live.method.knownDefects ?? []), ...proof.disclosedDefects]),
  ];

  return (
    <div className="flex flex-col gap-12 pt-6">
      <Link
        href="/agents"
        className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
      >
        ← All agents
      </Link>

      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-w-0 max-w-2xl flex-col gap-3">
            <p className="text-[11px] uppercase tracking-widest text-[color:var(--text-muted)]">
              {meta?.label ?? 'Unclassified'}
            </p>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {agent.name}
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              <EvidenceBadge verdict={proof.verdict} size="md" />
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                style={{
                  borderColor: answeredNow
                    ? 'color-mix(in srgb, var(--positive) 35%, transparent)'
                    : 'color-mix(in srgb, var(--negative) 35%, transparent)',
                  background: answeredNow ? 'var(--positive-dim)' : 'var(--negative-dim)',
                  color: answeredNow ? 'var(--positive)' : 'var(--negative)',
                }}
              >
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {answeredNow ? 'Live' : 'Not responding'}
              </span>
              <span className="mono text-[11px] text-[color:var(--text-faint)]">
                #{agent.token_id} · chain {agent.chain_id}
              </span>
            </div>

            {agent.description && (
              <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
                {agent.description}
              </p>
            )}
          </div>

          <div className="flex w-full max-w-xs flex-col gap-3">
            <ScorePanel score={score} />
            {proof.hirable ? (
              <Link
                href={`/hire/${agent.chain_id}/${agent.token_id}`}
                className="w-full rounded-[var(--radius)] bg-[color:var(--text)] px-4 py-2 text-center text-[13px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90"
              >
                Hire agent
              </Link>
            ) : (
              <p className="rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] px-3 py-2 text-[11px] leading-relaxed text-[color:var(--negative)]">
                Hiring is blocked. {proof.rationale}
              </p>
            )}
          </div>
        </div>

        <p className="max-w-3xl rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-xs leading-relaxed text-[color:var(--text-secondary)]">
          {proof.rationale}
        </p>
      </header>

      <TrustPanel dossier={dossier} explorerBase={explorerBase} />

      <PerformancePanel record={record} />

      <div className="grid gap-12 lg:grid-cols-2">
        <Section
          title="Watch it work"
          caption="Probed live when you loaded this page. Our own measurement, not a claim by the agent."
        >
          <LivePanel live={live} />
        </Section>

        <Section
          title="Track record"
          caption="What repeated sweeps have accumulated, rather than a single sample."
        >
          <TrackRecordPanel record={record} />
        </Section>

        <Section
          title="Receipts"
          caption="Attestations published on-chain by independent measurers. Every row links to its transaction."
        >
          <EvidencePanel attestations={attestations} />
        </Section>

        <Section
          title="What hiring it would grant"
          caption="Stated plainly, including what the registry does not disclose."
        >
          <AuthorityPanel agent={agent} />
        </Section>
      </div>

      <Section
        title="How the measurers could be wrong"
        caption="Limitations disclosed by the measurers themselves, ours included."
      >
        {knownDefects.length === 0 ? (
          <p className="text-xs text-[color:var(--text-faint)]">
            No measurer has disclosed its limitations.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {knownDefects.map((defect) => (
              <li
                key={defect}
                className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-[11px] leading-relaxed text-[color:var(--text-muted)]"
              >
                {defect}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
