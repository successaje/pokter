import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { plural } from '@/lib/ui/plural';
import { loadDossier } from '@/lib/marketplace';
import { RegistryUnreachable } from '@/components/ui/RegistryUnreachable';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import type { ChainId } from '@/lib/scan/types';

import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { EvidenceSection as Section } from '@/components/ui/EvidenceSection';
import { ScorePanel } from '@/components/ui/Score';
import { TrustPanel } from '@/components/agent/TrustPanel';
import { PerformancePanel } from '@/components/agent/PerformancePanel';
import { TrackRecordPanel } from '@/components/TrackRecordPanel';
import { LivePanel } from '@/components/LivePanel';
import { EvidencePanel } from '@/components/EvidencePanel';
import { AuthorityPanel } from '@/components/AuthorityPanel';
import { TrialPanel } from '@/components/agent/TrialPanel';
import { AgentAvatar } from '@/components/agent/AgentAvatar';

/** The live probe is taken per request, so this page is never cached. */
export const dynamic = 'force-dynamic';


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
  const meta =
    category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);
  const explorerBase = ALTANA_NETWORK.explorer.replace(/\/$/, '');
  const answeredNow = live.ratio !== null && live.ratio > 0;
  const availability =
    record.totalProbes === 0
      ? 'Not measured'
      : `${((record.totalAnswered / record.totalProbes) * 100).toFixed(1)}% uptime`;

  const knownDefects = [
    ...new Set([
      ...(live.method.knownDefects ?? []),
      ...proof.disclosedDefects,
    ]),
  ];

  /*
   * §10 Level 2: one line of real substance per collapsed section, so a phone
   * user can skip a section on evidence rather than on faith. Every one of
   * these is a measured count — where nothing was measured they say so, rather
   * than rendering a confident zero.
   */
  /*
   * Days here is `record.days.length` — days that actually carried a probe —
   * and not `observedDays`, which is the fractional calendar span between the
   * first and last. The span rendered raw as "7.177851539351852 days", and
   * rounding it would still have contradicted the trust panel directly below,
   * which counts observed days. Two different true numbers for one set of
   * probes reads as a mistake, so both places now make the same, more
   * conservative claim.
   */
  const probeSummary =
    record.totalProbes === 0
      ? 'No probes recorded yet.'
      : `Answered ${record.totalAnswered} of ${record.totalProbes} probes over ${plural(
          record.days.length,
          'day',
        )}.`;
  const liveSummary = answeredNow
    ? 'Answered our probe when you opened this page.'
    : 'Did not answer our probe when you opened this page.';
  const receiptsSummary =
    attestations.length === 0
      ? 'No independent measurer has attested to this agent.'
      : `${attestations.length} on-chain ${
          attestations.length === 1 ? 'attestation' : 'attestations'
        } from independent measurers.`;
  const defectsSummary =
    knownDefects.length === 0
      ? 'No measurer has disclosed its limitations.'
      : `${knownDefects.length} disclosed ${
          knownDefects.length === 1 ? 'limitation' : 'limitations'
        }, ours included.`;

  return (
    <div className="flex flex-col gap-6 pt-2">
      <Link
        href="/agents"
        className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
      >
        ← All agents
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-8">
          <header className="flex min-w-0 flex-col gap-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6">
            <div className="flex min-w-0 max-w-4xl items-start gap-4">
              <AgentAvatar name={agent.name} src={agent.image_url} />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <p className="text-[11px] uppercase tracking-widest text-[color:var(--text-muted)]">
                  {meta?.label ?? 'Unclassified'}
                </p>
                <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
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
                    <EvidenceBadge
                      verdict={proof.verdict}
                      size="md"
                      label={
                        proof.verdict === 'proven'
                          ? 'Historically proven'
                          : undefined
                      }
                    />
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
                        background: answeredNow
                          ? 'var(--positive-dim)'
                          : 'var(--negative-dim)',
                        color: answeredNow
                          ? 'var(--positive)'
                          : 'var(--negative)',
                      }}
                    >
                      <span
                        aria-hidden
                        className={
                          answeredNow
                            ? 'live-dot size-1.5 rounded-full bg-current'
                            : 'size-1.5 rounded-full bg-current'
                        }
                      />
                      {answeredNow ? 'Live check passed' : 'Live check failed'}
                    </span>
                  </span>
                  <span className="mono text-[11px] text-[color:var(--text-faint)]">
                    #{agent.token_id} · chain {agent.chain_id}
                  </span>
                </div>

                {agent.description && (
                  <details className="group max-w-3xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
                    <summary className="cursor-pointer list-none">
                      <span className="line-clamp-3 break-words [overflow-wrap:anywhere] group-open:hidden">
                        {agent.description}
                      </span>
                      <span className="mt-1.5 inline-flex text-[11px] font-medium text-[color:var(--text-muted)] group-open:hidden">
                        Read full description ↓
                      </span>
                      <span className="hidden break-words [overflow-wrap:anywhere] group-open:inline">
                        {agent.description}
                      </span>
                      <span className="mt-1.5 hidden text-[11px] font-medium text-[color:var(--text-muted)] group-open:block">
                        Show less ↑
                      </span>
                    </summary>
                  </details>
                )}

                <dl className="mt-1 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
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
                      {attestations.length} receipt
                      {attestations.length === 1 ? '' : 's'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <p className="max-w-3xl break-words border-l-2 border-[color:var(--brand)] pl-4 text-xs leading-relaxed text-[color:var(--text-secondary)] [overflow-wrap:anywhere]">
              {proof.rationale}
            </p>
          </header>

          <nav
            aria-label="Agent details"
            className="sticky top-16 z-20 -mx-1 hidden gap-1 overflow-x-auto md:flex rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)]/95 p-1 shadow-sm backdrop-blur"
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

          <div className="grid gap-12 xl:grid-cols-2">
            <div id="live" className="scroll-mt-28">
              <Section
                title="Watch it work"
                summary={liveSummary}
                caption="Probed live when you loaded this page. Our own measurement, not a claim by the agent."
              >
                <LivePanel live={live} />
              </Section>
            </div>

            <Section
              title="Track record"
              summary={probeSummary}
              caption="What repeated sweeps have accumulated, rather than a single sample."
            >
              <TrackRecordPanel record={record} />
            </Section>

            <div id="receipts" className="scroll-mt-28">
              <Section
                title="Receipts"
                summary={receiptsSummary}
                caption="Attestations published on-chain by independent measurers. Every row links to its transaction."
              >
                <EvidencePanel attestations={attestations} />
              </Section>
            </div>

            <div id="permissions" className="scroll-mt-28">
              <Section
                title="Permissions and spending limits"
                summary="What hiring would and would not allow."
                caption="Stated plainly, including what the registry does not disclose."
              >
                <AuthorityPanel agent={agent} />
              </Section>
            </div>
          </div>

          <Section
            title="How the measurers could be wrong"
            summary={defectsSummary}
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

        <aside
          className="sticky top-20 hidden flex-col gap-3 lg:flex"
          aria-label="Hire this agent"
        >
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
            <div className="border-b border-[color:var(--border)] p-4">
              <p className="text-[10px] uppercase tracking-widest text-[color:var(--text-faint)]">
                Hire this agent
              </p>
              <h2 className="mt-1.5 break-words text-lg font-medium tracking-tight [overflow-wrap:anywhere]">
                Review and hire
              </h2>
            </div>

            <dl className="grid grid-cols-2 gap-px bg-[color:var(--border)]">
              <div className="bg-[color:var(--surface)] p-3.5">
                <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  Price
                </dt>
                <dd className="mt-1 text-sm font-medium">0.10 $U</dd>
              </div>
              <div className="bg-[color:var(--surface)] p-3.5">
                <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  Protocol
                </dt>
                <dd className="mt-1 text-sm font-medium">ERC-8183</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 p-4">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 text-xs">
                <span className="min-w-0 break-words text-[color:var(--text-muted)]">
                  Historical evidence
                </span>
                <EvidenceBadge verdict={proof.verdict} />
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 text-xs">
                <span className="min-w-0 break-words text-[color:var(--text-muted)]">
                  Current status
                </span>
                <span
                  className={
                    answeredNow
                      ? 'max-w-[11rem] break-words text-right text-[color:var(--positive)] [overflow-wrap:anywhere]'
                      : 'max-w-[11rem] break-words text-right text-[color:var(--negative)] [overflow-wrap:anywhere]'
                  }
                >
                  {answeredNow ? 'Live check passed' : 'Live check failed'}
                </span>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 text-xs">
                <span className="min-w-0 break-words text-[color:var(--text-muted)]">
                  Observed availability
                </span>
                <span className="tabular text-right">{availability}</span>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 text-xs">
                <span className="min-w-0 break-words text-[color:var(--text-muted)]">
                  Spend ceiling
                </span>
                <span className="text-right text-[color:var(--caution)]">
                  Set at approval
                </span>
              </div>
            </div>

            <div className="border-t border-[color:var(--border)] p-4">
              <Link
                href={`/hire/${agent.chain_id}/${agent.token_id}`}
                className={
                  proof.recommendedForHire && answeredNow
                    ? 'action-primary block w-full rounded-[var(--radius)] px-4 py-2.5 text-center text-[13px]'
                    : 'block w-full rounded-[var(--radius)] border border-[color:var(--caution)]/45 bg-[color:var(--caution-dim)] px-4 py-2.5 text-center text-[13px] font-medium text-[color:var(--caution)] transition-colors hover:border-[color:var(--caution)]'
                }
              >
                {proof.recommendedForHire && answeredNow
                  ? 'Hire agent'
                  : 'Review risks and hire'}
              </Link>
              {(!proof.recommendedForHire || !answeredNow) && (
                <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--caution)]">
                  {proof.recommendedForHire
                    ? 'Strong historical evidence, but the latest live capability check failed.'
                    : 'This agent requires explicit risk acceptance before it can be hired.'}
                </p>
              )}
              <a
                href="#permissions"
                className="mt-3 block text-center text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
              >
                Review permissions and limits
              </a>
            </div>
          </div>

          <ScorePanel score={score} label="Evidence score" />
        </aside>
      </div>

      {/*
        Sits above the floated tab bar. The old `bottom-[3.25rem]` was measured
        against a tab bar attached to the edge; once that bar lifted off the
        canvas the two overlapped, and the primary action on the page ended up
        underneath the navigation — present in the DOM, tappable by a couple of
        pixels, and invisible to anyone actually looking for it.

        Above `md` the tab bar is hidden, so this returns to the edge.
      */}
      <div className="hire-action-bar fixed inset-x-0 z-30 border-t border-[color:var(--border-strong)] bg-[color:var(--bg)]/95 p-3 shadow-[0_-12px_32px_rgba(0,0,0,0.18)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">0.10 $U · ERC-8183</p>
            <p
              className={
                answeredNow
                  ? 'truncate text-[10px] text-[color:var(--positive)]'
                  : 'truncate text-[10px] text-[color:var(--negative)]'
              }
            >
              {answeredNow ? 'Live check passed' : 'Live check failed'}
            </p>
          </div>
          <Link
            href={`/hire/${agent.chain_id}/${agent.token_id}`}
            className={
              proof.recommendedForHire && answeredNow
                ? 'action-primary shrink-0 rounded-[var(--radius)] px-4 py-2 text-center text-xs'
                : 'shrink-0 rounded-[var(--radius)] border border-[color:var(--caution)]/45 bg-[color:var(--caution-dim)] px-4 py-2 text-center text-xs font-medium text-[color:var(--caution)]'
            }
          >
            {proof.recommendedForHire && answeredNow
              ? 'Hire agent'
              : 'Review & hire'}
          </Link>
        </div>
      </div>
    </div>
  );
}
