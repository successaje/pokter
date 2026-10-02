import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { plural } from '@/lib/ui/plural';
import { loadDossier } from '@/lib/marketplace';
import { RegistryUnreachable } from '@/components/ui/RegistryUnreachable';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import type { ChainId } from '@/lib/scan/types';
import {
  publishedEvidenceLine,
  summarisePublishedEvidence,
} from '@/lib/proof/published';
import { VERDICT_LABEL } from '@/lib/proof/engine';

import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { EvidenceSection as Section } from '@/components/ui/EvidenceSection';
import { ScorePanel } from '@/components/ui/Score';
import { DetailTabs } from '@/components/agent/DetailTabs';
import { TrustPanel } from '@/components/agent/TrustPanel';
import { PerformancePanel } from '@/components/agent/PerformancePanel';
import { EconomicHistoryPanel } from '@/components/agent/EconomicHistoryPanel';
import { VerifiedReviewsPanel } from '@/components/agent/VerifiedReviewsPanel';
import { TrackRecordPanel } from '@/components/TrackRecordPanel';
import { LivePanel } from '@/components/LivePanel';
import { EvidencePanel } from '@/components/EvidencePanel';
import { AuthorityPanel } from '@/components/AuthorityPanel';
import { TrialPanel } from '@/components/agent/TrialPanel';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { MobileHireAction } from '@/components/agent/MobileHireAction';
import { TrustStrip } from '@/components/agent/TrustStrip';
import { SimilarAgents } from '@/components/agent/SimilarAgents';
import { ShareAgent } from '@/components/agent/ShareAgent';
import { SaveAgentButton } from '@/components/agent/SaveAgentButton';
import { DEFAULT_BUDGET_LABEL, formatQuotedPrice } from '@/lib/erc8183/pricing';
import { PAYMENT_VALUE_NOTE } from '@/lib/network/presentation';
import { CopyableId } from '@/components/ui/CopyableId';
import { shortAddress } from '@/lib/ui/format';
import { getJobStore } from '@/lib/erc8183/store';
import { summariseEconomicHistory } from '@/lib/erc8183/economic-history';
import { getReviewStore } from '@/lib/reviews/store';

/** The live probe is taken per request, so this page is never cached. */
export const dynamic = 'force-dynamic';


/**
 * What a shared agent link looks like when it is unfurled.
 *
 * Every agent link previewed as the generic site card — same title, same
 * image, same sentence — which made a share worth about as much as a bare
 * URL. Shipping a share button while every link unfurled identically was
 * half a feature.
 *
 * The description carries the evidence rather than the operator's pitch,
 * because the pitch is the thing this product exists to check. A preview
 * showing "Proven · 96% over 288 probes" and one showing "Not measured" are
 * different claims, and the difference should survive being pasted into a
 * chat window.
 *
 * Failures degrade to the site defaults rather than throwing: an unfurl is
 * not worth a 500 on the page itself.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ chainId: string; tokenId: string }>;
}): Promise<Metadata> {
  const { chainId: rawChainId, tokenId } = await params;
  const chainId = Number(rawChainId) as ChainId;
  if (chainId !== 56 && chainId !== 97) return {};

  const result = await loadDossier(chainId, tokenId);
  if (result.state !== 'ok') return {};

  const { agent, category, proof, record } = result.dossier;
  const meta = category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);

  const measured =
    record.totalProbes === 0
      ? 'Not measured by Pokter yet'
      : `${((record.totalAnswered / record.totalProbes) * 100).toFixed(1)}% of ${plural(record.totalProbes, 'probe')} answered`;

  const description = [
    `${VERDICT_LABEL[proof.verdict]} · ${measured}.`,
    meta ? `${meta.label} agent on BNB Chain.` : 'Agent on BNB Chain.',
    'Evidence you can check before you hire.',
  ].join(' ');

  const title = `${agent.name} — ${VERDICT_LABEL[proof.verdict]}`;
  const url = `/agents/${chainId}/${tokenId}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
  };
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

  /*
   * The agent's own price, where it has one.
   *
   * Both price slots on this page printed DEFAULT_BUDGET_LABEL — Pokter's
   * house budget — under the words "Hire price" and "Starting from". So an
   * agent whose card advertised 0.50 $U showed 0.10 here, and a reader
   * comparing the two pages found the marketplace disagreeing with itself
   * about what one agent charges.
   *
   * They are different quantities and now say which is which: a signed quote
   * is what the agent asked for, and the default is only where an offer
   * starts for an agent that has never named a price.
   */
  const askedPrice = dossier.quote
    ? formatQuotedPrice(Number(dossier.quote.priceU))
    : null;
  const priceLabel = askedPrice ?? DEFAULT_BUDGET_LABEL;
  const priceCaption = askedPrice ? 'Price it asked for' : 'Starting from';
  const economicHistory = summariseEconomicHistory(
    getJobStore().byAgent(agent.chain_id, agent.token_id),
  );
  const verifiedReviews = getReviewStore().byAgent(agent.chain_id, agent.token_id);
  const publishedEvidence = summarisePublishedEvidence(attestations);
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
  const receiptsSummary = `${publishedEvidenceLine(publishedEvidence)}.`;
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
        className="tap self-start text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)] md:self-auto"
      >
        ← All agents
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-8">
          <header className="relative flex min-w-0 flex-col gap-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6">
            {/*
              Top corner of the identity card, out of the reading order of the
              name and its badges. It belongs to the whole card rather than to
              any one line in it, and the hire column would have hidden it
              below 1024px — exactly the widths where a platform share sheet
              exists.
            */}
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2 sm:right-5 sm:top-5">
              <SaveAgentButton agent={{ chainId: agent.chain_id, tokenId: agent.token_id, name: agent.name, imageUrl: agent.image_url ?? null, category, description: agent.description?.trim() || 'No description published.' }} compact />
              <ShareAgent name={agent.name} />
            </div>

            <div className="flex min-w-0 max-w-4xl items-start gap-4 pr-20">
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
                  {/*
                    Both of these are read here and then pasted somewhere
                    else — an explorer, a support message — so both are
                    copyable rather than something to select by hand.
                  */}
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <CopyableId
                      label="Identity"
                      value={`${agent.chain_id}:${agent.token_id}`}
                      display={`#${agent.token_id} · chain ${agent.chain_id}`}
                    />
                    {agent.owner_address && (
                      <CopyableId
                        label="Owner wallet"
                        value={agent.owner_address}
                        display={`Publisher ${shortAddress(agent.owner_address)}`}
                      />
                    )}
                  </span>
                </div>

                {agent.description && (
                  <details className="group max-w-3xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
                    <summary className="cursor-pointer list-none">
                      <span className="line-clamp-2 break-words [overflow-wrap:anywhere] group-open:hidden md:line-clamp-3">
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

              </div>
            </div>

            <p className="hidden max-w-3xl break-words border-l-2 border-[color:var(--brand)] pl-4 text-xs leading-relaxed text-[color:var(--text-secondary)] [overflow-wrap:anywhere] lg:block">
              {proof.rationale}
            </p>

            {/*
            §5. The hire decision sits directly under the identity on a phone,
            not four screens below it. It carries a measured line as well as a
            price, so the first thing in reach is not a bare CTA.
            */}
            <MobileHireAction
            href={`/hire/${agent.chain_id}/${agent.token_id}`}
            price={priceLabel}
            answeredNow={answeredNow}
            recommended={proof.recommendedForHire}
            verdictLabel={
            answeredNow ? 'Live check passed' : 'Live check failed'
            }
            evidenceLine={probeSummary}
            />

            {/*
              The old three-cell grid said the same things without saying
              where any of them came from, and hid on phones because it could
              not fit. This replaces it: the same facts plus identity, each
              carrying its source, at every width.
            */}
            <TrustStrip dossier={dossier} />
          </header>

          {agent.services?.a2a?.endpoint && (
            <div id="try" className="scroll-mt-28">
              <TrialPanel agent={{ chainId, tokenId, name: agent.name }} />
            </div>
          )}

          {/*
            Tabs rather than one long scroll.
            
            The evidence here is deep by design, and stacking all of it meant a
            reader chasing one question — is it live, who vouches for it, what
            would hiring allow — scrolled through the answers to the other
            three to reach it. The depth is the product; making someone wade
            through it was never part of the argument.

            Grouped by the question each answers rather than by which component
            renders it, which is why reliability holds three panels and
            permissions holds one.
          */}
          <DetailTabs
            tabs={[
              {
                id: 'evidence',
                label: 'Evidence',
                content: (
                  <>
                    <TrustPanel dossier={dossier} explorerBase={explorerBase} />
                    <Section
                      title="Receipts"
                      summary={receiptsSummary}
                      caption="Published on-chain receipts, with named and unattributed measurers distinguished. Every row links to its transaction."
                    >
                      <EvidencePanel attestations={attestations} />
                    </Section>
                  </>
                ),
              },
              {
                id: 'paid-work',
                label: 'Paid work',
                content: (
                  <Section
                    title="Verified marketplace history"
                    summary={
                      economicHistory.jobs === 0
                        ? 'No attributed funded jobs in Pokter’s index.'
                        : `${economicHistory.completed} completed of ${economicHistory.jobs} funded jobs.`
                    }
                    caption="ERC-8183 outcomes attributed to this ERC-8004 identity by Pokter’s immutable job envelope."
                  >
                    <EconomicHistoryPanel history={economicHistory} />
                    <div className="mt-6 border-t border-[color:var(--border)] pt-6">
                      <h3 className="mb-3 text-sm font-medium">Verified buyer reviews</h3>
                      <VerifiedReviewsPanel reviews={verifiedReviews} />
                    </div>
                  </Section>
                ),
              },
              {
                id: 'reliability',
                label: 'Reliability',
                content: (
                  <>
                    <PerformancePanel record={record} />
                    <Section
                      title="Watch it work"
                      summary={liveSummary}
                      caption="Probed live when you loaded this page. Our own measurement, not a claim by the agent."
                    >
                      <LivePanel live={live} />
                    </Section>
                    <Section
                      title="Track record"
                      summary={probeSummary}
                      caption="What repeated sweeps have accumulated, rather than a single sample."
                    >
                      <TrackRecordPanel record={record} />
                    </Section>
                  </>
                ),
              },
              {
                id: 'permissions',
                label: 'Permissions',
                content: (
                  <Section
                    title="Permissions and spending limits"
                    summary="What hiring would and would not allow."
                    caption="Stated plainly, including what the registry does not disclose."
                  >
                    <AuthorityPanel agent={agent} />
                  </Section>
                ),
              },
              {
                id: 'limitations',
                label: 'Limitations',
                content: (
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
                            className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-[12px] leading-relaxed text-[color:var(--text-muted)]"
                          >
                            {defect}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                ),
              },
            ]}
          />
        </div>

        <aside
          className="sticky top-20 hidden flex-col gap-3 lg:flex"
          aria-label="Hire this agent"
        >
          <div className="surface-card flex flex-col gap-4 p-5">
            {/*
              Status first, because it changes what the rest of the card is
              worth. This is the live probe taken when the page loaded, not a
              stored flag.
            */}
            <span
              className={
                answeredNow
                  ? 'inline-flex w-fit items-center gap-1.5 rounded-full border border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--positive)]'
                  : 'inline-flex w-fit items-center gap-1.5 rounded-full border border-[color:var(--negative)]/35 bg-[color:var(--negative-dim)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--negative)]'
              }
            >
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {answeredNow ? 'Answering now' : 'Not answering'}
            </span>

            <div>
              <p className="text-[11px] text-[color:var(--text-muted)]">
                {priceCaption}
              </p>
              <p className="tabular mt-1 font-[family-name:var(--font-serif)] text-3xl leading-none">
                {priceLabel}
              </p>
              {/*
                No dollar estimate. On testnet these are faucet tokens worth
                nothing, and converting them to a currency figure would dress
                up a number that has no price.
              */}
              {PAYMENT_VALUE_NOTE && (
                <p className="mt-1.5 text-[11px] text-[color:var(--text-faint)]">
                  {PAYMENT_VALUE_NOTE}
                </p>
              )}
            </div>

            <dl className="flex flex-col gap-2.5 border-t border-[color:var(--border)] pt-4 text-[12px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[color:var(--text-muted)]">Escrow</dt>
                <dd className="mono">ERC-8183</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[color:var(--text-muted)]">Evidence</dt>
                <dd>
                  <EvidenceBadge verdict={proof.verdict} />
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[color:var(--text-muted)]">Availability</dt>
                <dd className="tabular">{availability}</dd>
              </div>
              {/*
                The old row here read "Spend ceiling — set at approval", which
                implied a ceiling gets set. Delegated execution is paused, so
                nothing is granted at all, and saying so is both simpler and
                the more reassuring of the two.
              */}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[color:var(--text-muted)]">Wallet access</dt>
                <dd className="text-right font-medium text-[color:var(--positive)]">
                  None
                </dd>
              </div>
            </dl>

            <div className="flex flex-col gap-2">
              <Link
                href={`/hire/${agent.chain_id}/${agent.token_id}`}
                className={
                  proof.recommendedForHire && answeredNow
                    ? 'action-primary block w-full rounded-[var(--radius)] px-4 py-3 text-center text-[13px]'
                    : 'block w-full rounded-[var(--radius)] border border-[color:var(--caution)]/45 bg-[color:var(--caution-dim)] px-4 py-3 text-center text-[13px] font-medium text-[color:var(--caution)] transition-colors hover:border-[color:var(--caution)]'
                }
              >
                {proof.recommendedForHire && answeredNow
                  ? 'Hire agent'
                  : 'Review risks and hire'}
              </Link>

              <Link
                href={`/compare?agents=${agent.chain_id}:${agent.token_id}`}
                className="block w-full rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-3 text-center text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
              >
                Add to compare
              </Link>
            </div>

            {(!proof.recommendedForHire || !answeredNow) && (
              <p className="text-[12px] leading-relaxed text-[color:var(--caution)]">
                {proof.recommendedForHire
                  ? 'Strong historical evidence, but the latest live capability check failed.'
                  : 'This agent requires explicit risk acceptance before it can be hired.'}
              </p>
            )}

            <p className="flex items-start gap-2 border-t border-[color:var(--border)] pt-4 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
              <svg viewBox="0 0 24 24" aria-hidden className="mt-px size-3.5 shrink-0 fill-none stroke-current" strokeWidth="1.8">
                <path d="M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7z" />
              </svg>
              Funds stay in escrow until you accept the delivery.
            </p>
          </div>

          <ScorePanel score={score} label="Evidence score" />
        </aside>
      </div>

      <SimilarAgents
        category={category}
        chainId={agent.chain_id}
        tokenId={agent.token_id}
      />
    </div>
  );
}
