import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { loadDossier } from '@/lib/marketplace';
import { RegistryUnreachable } from '@/components/ui/RegistryUnreachable';
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
import { TrialPanel } from '@/components/agent/TrialPanel';

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

  const result = await loadDossier(chainId, tokenId);
  if (result.state === 'missing') notFound();
  if (result.state === 'unreachable') {
    return <RegistryUnreachable chainId={chainId} tokenId={tokenId} />;
  }
  const dossier = result.dossier;

  const { agent, category, attestations, proof, live, record, score } = dossier;
  const meta = category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);
  const explorerBase = ALTANA_NETWORK.explorer.replace(/\/$/, '');
  const answeredNow = live.ratio !== null && live.ratio > 0;
  const availability =
    record.totalProbes === 0
      ? 'Not measured'
      : `${((record.totalAnswered / record.totalProbes) * 100).toFixed(1)}% uptime`;

  const knownDefects = [
    ...new Set([...(live.method.knownDefects ?? []), ...proof.disclosedDefects]),
  ];

  return (
    <div className="flex flex-col gap-10 pt-6">
      <Link
        href="/agents"
        className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
      >
        ← All agents
      </Link>

      <header className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-w-0 max-w-2xl flex-col gap-3">
            <p className="text-[11px] uppercase tracking-widest text-[color:var(--text-muted)]">
              {meta?.label ?? 'Unclassified'}
            </p>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {agent.name}
            </h1>

            {/*
              FE-06. These two badges used to sit bare and adjacent, so
              "Proven" beside "Not responding" read as a contradiction. They
              are not: one is the accumulated verdict, the other is this
              second's probe, and that distinction is the thing this product
              cares about most. Naming each one draws it.
            */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  Evidence
                </span>
                <EvidenceBadge verdict={proof.verdict} size="md" />
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  Right now
                </span>
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
                <span
                  aria-hidden
                  className={answeredNow ? 'live-dot size-1.5 rounded-full bg-current' : 'size-1.5 rounded-full bg-current'}
                />
                {answeredNow ? 'Answering' : 'Not responding'}
              </span>
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

            <dl className="mt-1 grid grid-cols-3 gap-2">
              <div className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-2.5">
                <dt className="text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]">
                  Reliability
                </dt>
                <dd className="tabular mt-1 text-[11px] font-medium">
                  {availability}
                </dd>
              </div>
              <div className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-2.5">
                <dt className="text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]">
                  Observations
                </dt>
                <dd className="tabular mt-1 text-[11px] font-medium">
                  {/* FE-12. Whose count this is, said plainly — the rationale
                      below reports the total across every measurer. */}
                  {record.totalProbes} by Pokter
                </dd>
              </div>
              <div className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-2.5">
                <dt className="text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]">
                  Evidence
                </dt>
                <dd className="tabular mt-1 text-[11px] font-medium">
                  {attestations.length} receipt{attestations.length === 1 ? '' : 's'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex w-full max-w-xs flex-col gap-3">
            <ScorePanel score={score} />
            <Link
              href={`/hire/${agent.chain_id}/${agent.token_id}`}
              className={
                proof.recommendedForHire && answeredNow
                  ? 'action-primary w-full rounded-[var(--radius)] px-4 py-2 text-center text-[13px]'
                  : 'w-full rounded-[var(--radius)] border border-[color:var(--caution)]/45 bg-[color:var(--caution-dim)] px-4 py-2 text-center text-[13px] font-medium text-[color:var(--caution)] transition-colors hover:border-[color:var(--caution)]'
              }
            >
              {proof.recommendedForHire && answeredNow
                ? 'Hire agent'
                : 'Review risks and hire'}
            </Link>
            {(!proof.recommendedForHire || !answeredNow) && (
              <p className="text-[11px] leading-relaxed text-[color:var(--caution)]">
                Not recommended:{' '}
                {proof.recommendedForHire
                  ? 'the current live probe failed.'
                  : proof.rationale}
              </p>
            )}
          </div>
        </div>

        <p className="max-w-3xl border-l-2 border-[color:var(--brand)] pl-4 text-xs leading-relaxed text-[color:var(--text-secondary)]">
          {proof.rationale}
        </p>
      </header>

      <nav
        aria-label="Agent details"
        className="sticky top-16 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)]/95 p-1 shadow-sm backdrop-blur"
      >
        {[
          ...(agent.services?.a2a?.endpoint ? [['#try', 'Try']] : []),
          ['#trust', 'Trust'],
          ['#performance', 'Performance'],
          ['#live', 'Live proof'],
          ['#receipts', 'Receipts'],
          ['#permissions', 'Permissions'],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="shrink-0 rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-[11px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
          >
            {label}
          </a>
        ))}
      </nav>

      {agent.services?.a2a?.endpoint && (
        <div id="try" className="scroll-mt-28">
          <TrialPanel agent={{ chainId, tokenId, name: agent.name }} />
        </div>
      )}

      <div id="trust" className="scroll-mt-28">
        <TrustPanel dossier={dossier} explorerBase={explorerBase} />
      </div>

      <div id="performance" className="scroll-mt-28">
        <PerformancePanel record={record} />
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        <div id="live" className="scroll-mt-28">
          <Section
            title="Watch it work"
            caption="Probed live when you loaded this page. Our own measurement, not a claim by the agent."
          >
            <LivePanel live={live} />
          </Section>
        </div>

        <Section
          title="Track record"
          caption="What repeated sweeps have accumulated, rather than a single sample."
        >
          <TrackRecordPanel record={record} />
        </Section>

        <div id="receipts" className="scroll-mt-28">
          <Section
            title="Receipts"
            caption="Attestations published on-chain by independent measurers. Every row links to its transaction."
          >
            <EvidencePanel attestations={attestations} />
          </Section>
        </div>

        <div id="permissions" className="scroll-mt-28">
          <Section
            title="What hiring it would grant"
            caption="Stated plainly, including what the registry does not disclose."
          >
            <AuthorityPanel agent={agent} />
          </Section>
        </div>
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
