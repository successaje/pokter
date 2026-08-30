import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { getDossier } from '@/lib/marketplace';
import type { ChainId } from '@/lib/scan/types';
import { VerdictBadge } from '@/components/VerdictBadge';
import { EvidencePanel } from '@/components/EvidencePanel';
import { LivePanel } from '@/components/LivePanel';
import { AuthorityPanel } from '@/components/AuthorityPanel';
import { TrackRecordPanel } from '@/components/TrackRecordPanel';
import { HireGate } from '@/components/HireGate';

// The live probe must be taken at request time, so this page is never cached.
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
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        <p className="text-xs text-[color:var(--muted)]">{caption}</p>
      </div>
      {children}
    </section>
  );
}

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

  const { agent, category, attestations, proof, live, record } = dossier;
  const meta = category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);

  return (
    <div className="flex flex-col gap-10">
      <Link
        href="/"
        className="text-xs text-[color:var(--muted-dim)] hover:text-[color:var(--foreground)]"
      >
        ← All agents
      </Link>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
              {agent.name}
            </h1>
            <p className="tabular text-[11px] text-[color:var(--muted-dim)]">
              {meta ? meta.label : 'Unclassified'} · token #{agent.token_id} · chain{' '}
              {agent.chain_id}
            </p>
          </div>
          <VerdictBadge verdict={proof.verdict} score={proof.score} size="lg" />
        </div>

        {agent.description && (
          <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--muted)]">
            {agent.description}
          </p>
        )}

        <p className="max-w-3xl rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5 text-xs leading-relaxed">
          {proof.rationale}
        </p>
      </header>

      <HireGate proof={proof} live={live} agentName={agent.name} />

      <div className="grid gap-10 lg:grid-cols-2">
        <Section
          title="Watch it work"
          caption="Probed live when you loaded this page. This is our own measurement, not a claim by the agent."
        >
          <LivePanel live={live} />
        </Section>

        <Section
          title="Track record"
          caption="What our scheduled sweeps have accumulated over time, not a single sample."
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

        <Section
          title="How the measurers could be wrong"
          caption="Defects disclosed by the measurers themselves, ours included."
        >
          {proof.disclosedDefects.length === 0 && live.method.knownDefects?.length === 0 ? (
            <p className="text-xs text-[color:var(--muted-dim)]">
              No measurer has disclosed its limitations.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {[
                ...new Set([
                  ...(live.method.knownDefects ?? []),
                  ...proof.disclosedDefects,
                ]),
              ].map((defect) => (
                <li
                  key={defect}
                  className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-[11px] leading-relaxed text-[color:var(--muted)]"
                >
                  {defect}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
