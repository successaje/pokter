import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { fetchDeclaredCapabilities } from '@/lib/agents/agent-card';
import { loadDossier, recommendedAlternatives } from '@/lib/marketplace';
import { providerChoicesFor } from '@/lib/erc8183/providers';
import { getJobStore } from '@/lib/erc8183/store';
import { summariseEconomicHistory } from '@/lib/erc8183/economic-history';
import { DEFAULT_BUDGET_LABEL, formatQuotedPrice } from '@/lib/erc8183/pricing';
import { getReviewStore } from '@/lib/reviews/store';
import { sampleDelivery } from '@/lib/agent/sample-delivery';
import { deliveryTimes } from '@/lib/agent/delivery-times';
import { STALE_AFTER_DAYS, daysSinceLastAnswer, stripCells } from '@/lib/history/strip';
import { VERDICT_LABEL, VERDICT_MEANING } from '@/lib/proof/engine';
import { publishedEvidenceLine, summarisePublishedEvidence } from '@/lib/proof/published';
import { PAYMENT_VALUE_NOTE, chainLabel, explorerBaseFor } from '@/lib/network/presentation';
import type { ChainId } from '@/lib/scan/types';
import { formatDelivery, formatMs, shortAddress } from '@/lib/ui/format';
import { plural } from '@/lib/ui/plural';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { SaveAgentButton } from '@/components/agent/SaveAgentButton';
import { ShareAgent } from '@/components/agent/ShareAgent';
import { DeliverySample } from '@/components/agent/DeliverySample';
import { MobileHireAction } from '@/components/agent/MobileHireAction';
import { TrialPanel } from '@/components/agent/TrialPanel';
import { RegistryUnreachable } from '@/components/ui/RegistryUnreachable';
import { Status } from '@/components/ui/Status';
import { DefinitionList } from '@/components/ui/Definition';
import { CopyableId } from '@/components/ui/CopyableId';
import { Strip } from '@/components/find/Strip';
import { HireButton, HireDrawer } from '@/components/hire/HireDrawer';

export const dynamic = 'force-dynamic';

const VERDICT_TONE = {
  proven: 'positive',
  reliable: 'positive',
  emerging: 'caution',
  observed: 'info',
  failing: 'negative',
  unproven: 'neutral',
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chainId: string; tokenId: string }>;
}): Promise<Metadata> {
  const { chainId, tokenId } = await params;
  const result = await loadDossier(Number(chainId) as ChainId, tokenId);
  if (result.state !== 'ok') return { title: 'Agent' };
  const { agent } = result.dossier;
  return {
    title: agent.name,
    description: (agent.description ?? '').trim().slice(0, 160) || `What Pokter has observed about ${agent.name}.`,
  };
}

/** One titled band of the dossier. The lead says what the numbers under it are. */
function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 flex flex-col gap-4">
      <div>
        <h2 id={`${id}-h`} className="text-title">
          {title}
        </h2>
        {lead && <p className="mt-0.5 text-body-s text-ink-muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * One agent, as a document rather than a tab strip.
 *
 * This page used to be a header, a row of tabs and fourteen panels, each
 * with its own heading, border and explanation of itself. A reader deciding
 * whether to hire had to visit three tabs to learn whether the thing
 * answers, what it charges and whether anyone has paid it — and the panels
 * disagreed about emphasis, because each had been written to stand alone.
 *
 * It reads top to bottom now: what you get, try it, the record, paid work,
 * identity. The decision travels in a rail that stays with you, and the
 * detail that only some readers want is behind disclosures rather than
 * behind tabs, so the page still prints and still finds on Ctrl-F.
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
  if (result.state === 'unreachable') return <RegistryUnreachable chainId={chainId} tokenId={tokenId} />;
  const { agent, category, attestations, proof, live, record, score, quote } = result.dossier;

  /*
   * Read together. Each of these is an independent round trip — the agent's
   * own card, the provider list, the stored deliveries, the chain's
   * submission times — and serialising them made the dossier as slow as
   * their sum rather than as their longest.
   */
  const [capabilities, providers, sample, delivery] = await Promise.all([
    fetchDeclaredCapabilities(agent.services?.a2a?.endpoint, agent.token_id),
    providerChoicesFor(agent, ALTANA_NETWORK.chainId),
    Promise.resolve(sampleDelivery(agent.chain_id, agent.token_id)),
    deliveryTimes(agent.chain_id, agent.token_id),
  ]);
  const history = summariseEconomicHistory(getJobStore().byAgent(agent.chain_id, agent.token_id));
  const reviews = getReviewStore().byAgent(agent.chain_id, agent.token_id);
  const published = summarisePublishedEvidence(attestations);

  const meta = category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);
  const answeredNow = live.ratio !== null && live.ratio > 0;
  const sinceAnswer = daysSinceLastAnswer(record);
  const stale = sinceAnswer !== null && sinceAnswer > STALE_AFTER_DAYS && !answeredNow;
  const rate = record.totalProbes ? record.totalAnswered / record.totalProbes : null;
  const month = record.windows.find((window) => window.label === '30d');
  /*
   * An agent's runtime watches the chain it is registered on. Identities sit
   * on 56 and escrow on 97, so a registry agent cannot see the job and
   * Pokter's own seller carries out the brief instead. Everything else here
   * describes the agent; none of it describes what a buyer receives today.
   */
  const deliveredByPokter = agent.chain_id !== ALTANA_NETWORK.chainId;
  /*
   * A signed quote is what this agent asked for; the default is only where
   * an offer starts for one that has never named a price. Both slots used to
   * print the house budget under the words "Hire price", so an agent whose
   * card advertised 0.50 $U showed 0.10 here.
   */
  const signedPrice = quote ? formatQuotedPrice(Number(quote.priceU)) : null;
  const priceLabel = signedPrice ?? DEFAULT_BUDGET_LABEL;
  const recommendedNow = proof.recommendedForHire && answeredNow;
  const riskWarnings = [
    ...(!proof.recommendedForHire ? [proof.rationale] : []),
    ...(!answeredNow ? ['The agent did not answer Pokter’s live check when this page loaded.'] : []),
  ];
  const alternatives =
    riskWarnings.length > 0
      ? await recommendedAlternatives(category === 'unclassified' ? 'health-factor' : category, tokenId).catch(() => [])
      : [];
  const availability =
    record.totalProbes === 0
      ? { tone: 'neutral' as const, word: 'Never called' }
      : answeredNow
        ? { tone: 'positive' as const, word: 'Answering now' }
        : sinceAnswer === null
          ? { tone: 'negative' as const, word: 'Has never answered' }
          : stale
            ? { tone: 'negative' as const, word: `Quiet for ${plural(sinceAnswer, 'day')}` }
            : { tone: 'caution' as const, word: 'Not answering right now' };
  const description = (agent.description ?? '').trim();
  const explorer = explorerBaseFor(agent.chain_id);
  const knownDefects = [...new Set([...(live.method.knownDefects ?? []), ...proof.disclosedDefects])];
  const evidenceLine =
    rate === null
      ? 'Pokter has not called this agent yet.'
      : `${Math.round(rate * 100)}% of ${plural(record.totalProbes, 'check')} answered.`;

  return (
    <div className="pb-24 pt-6 sm:pt-8 lg:pb-16">
      <nav aria-label="Breadcrumb" className="mb-4 text-small text-ink-muted">
        <Link href="/discover" className="hover:text-ink">
          Find
        </Link>
        {meta && (
          <>
            <span aria-hidden className="mx-1.5 text-ink-faint">/</span>
            <Link href={`/discover?category=${category}`} className="hover:text-ink">
              {meta.label}
            </Link>
          </>
        )}
      </nav>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <AgentAvatar name={agent.name} src={agent.image_url} />
          <div className="min-w-0">
            <h1 className="break-words text-page [overflow-wrap:anywhere]">{agent.name}</h1>
            <p className="mt-0.5 text-body-s text-ink-muted">
              {meta?.label ?? 'Unclassified'} · registered on {chainLabel(agent.chain_id)}
              {agent.owner_username ? ` · by ${agent.owner_username}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Status tone={VERDICT_TONE[proof.verdict]}>{VERDICT_LABEL[proof.verdict]}</Status>
              <Status tone={availability.tone} live={answeredNow}>
                {availability.word}
              </Status>
              {deliveredByPokter && (
                <span className="text-small text-ink-muted">Delivered through Pokter’s seller</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SaveAgentButton
            agent={{
              chainId: agent.chain_id,
              tokenId: agent.token_id,
              name: agent.name,
              imageUrl: agent.image_url ?? null,
              category,
              description: description || 'No description published.',
            }}
            compact
          />
          <ShareAgent name={agent.name} />
          <div className="hidden lg:block">
            <HireButton variant={recommendedNow ? 'primary' : 'caution'}>
              {recommendedNow ? `Hire for ${priceLabel}` : 'Review and hire'}
            </HireButton>
          </div>
        </div>
      </header>

      {/*
        The phone's copy of the decision: a card here, and a sticky bar once
        that card scrolls away. It sets data-hire-bar on the body, which is
        how the mobile tab bar knows to stand down rather than stacking two
        fixed bars at the foot of a phone.
      */}
      <div className="mt-6 lg:hidden">
        <MobileHireAction
          price={priceLabel}
          priceCaption={signedPrice ? 'Its signed price' : 'Starting budget, you set it'}
          answeredNow={answeredNow}
          recommended={proof.recommendedForHire}
          verdictLabel={VERDICT_LABEL[proof.verdict]}
          evidenceLine={evidenceLine}
        />
      </div>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section id="what" title="What you get">
            <DefinitionList
              items={[
                { term: 'It covers', detail: meta?.blurb ?? 'Outside the kinds of work Pokter judges.' },
                { term: 'You give it', detail: 'A written brief. It is not given your wallet or any position to read.' },
                { term: 'You receive', detail: 'One written assessment, delivered with a hash on chain.' },
                {
                  term: 'It can move funds',
                  detail: 'No. Nothing you sign grants it any access, and the escrow pays only on delivery.',
                },
              ]}
            />
            {description && (
              /*
                The publisher's own words, folded away and labelled as theirs.
                It is the one block on this page Pokter has not checked, and
                it used to open the dossier — so the least verified thing was
                the first thing read.
              */
              <details className="group rounded-md border border-line bg-canvas-subtle">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-body-s [&::-webkit-details-marker]:hidden">
                  <span>
                    In the publisher’s own words <span className="text-ink-faint">· not checked by Pokter</span>
                  </span>
                  <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="border-t border-line px-4 py-3 text-body-s leading-relaxed text-ink-secondary [overflow-wrap:anywhere]">
                  {description}
                </p>
                {capabilities.length > 0 && (
                  <ul className="flex flex-col gap-1 border-t border-line px-4 py-3 text-body-s">
                    <li className="text-small text-ink-faint">Skills it declares at its endpoint right now</li>
                    {capabilities.map((skill) => (
                      <li key={skill.name}>
                        <span className="font-medium">{skill.name}</span>
                        {skill.description && <span className="text-ink-muted"> · {skill.description}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            )}
          </Section>

          {agent.services?.a2a?.endpoint && (
            <Section id="try" title="Try it for free" lead="One read-only question to its endpoint. No wallet, nothing stored.">
              <TrialPanel agent={{ chainId, tokenId, name: agent.name }} />
            </Section>
          )}

          <Section
            id="record"
            title="The record"
            lead="What happened when Pokter called it, every two hours, for the last thirty days."
          >
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
              <Strip cells={stripCells(record, 30)} size="lg" className="[&>li]:w-auto [&>li]:flex-1" />
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-body-s">
                <p>
                  <span className="tabular font-semibold">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</span>{' '}
                  <span className="text-ink-muted">of {plural(record.totalProbes, 'check')} answered</span>
                </p>
                <p className="text-ink-muted">
                  {month?.medianMs != null ? `Answers in ${formatMs(month.medianMs)} (median)` : 'No answer time yet'}
                  {record.longestOutage ? ` · longest silence ${plural(record.longestOutage.probes, 'check')}` : ''}
                </p>
              </div>
              <p className="text-body-s leading-relaxed text-ink-secondary">{proof.rationale}</p>
            </div>
            <DefinitionList
              columns={2}
              dense
              items={[
                ...record.windows.map((window) => ({
                  term: `Last ${window.label}`,
                  detail: window.probes ? `${Math.round((window.ratio ?? 0) * 100)}% of ${window.probes}` : 'Not checked',
                  note: window.medianMs != null ? `${formatMs(window.medianMs)} median` : undefined,
                })),
                {
                  term: 'Just now',
                  detail: live.probes.length ? `${live.answered} of ${live.probes.length} answered` : 'Not probed',
                  note:
                    live.medianMs != null
                      ? `${formatMs(live.medianMs)} over ${live.protocol.toUpperCase()}`
                      : 'Checked when this page loaded',
                },
                {
                  term: 'On chain',
                  detail: publishedEvidenceLine(published),
                  note: published.total ? 'Every attestation links to its transaction below' : 'No independent measurer yet',
                },
                {
                  term: 'Pokter score',
                  detail: score.overall === null ? 'Not computable' : `${Math.round(score.overall)} / 100`,
                  note: `${score.measuredDimensions} of ${score.totalDimensions} dimensions measured`,
                },
              ]}
            />
            <p className="text-small text-ink-muted">{VERDICT_MEANING[proof.verdict]}</p>
            {attestations.length > 0 && (
              <details className="group rounded-md border border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-body-s [&::-webkit-details-marker]:hidden">
                  <span>{plural(attestations.length, 'attestation')} on chain</span>
                  <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-45">+</span>
                </summary>
                <ul className="hairline border-t border-line text-body-s">
                  {attestations.slice(0, 12).map((attestation) => (
                    <li key={attestation.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
                      <span className="min-w-0">
                        <span className="font-medium">{attestation.measuredBy ?? 'Unnamed measurer'}</span>
                        <span className="text-ink-muted">
                          {' '}
                          · {attestation.dimension}
                          {attestation.window ? ` · ${attestation.window}` : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular">
                          {attestation.ratio === null ? '—' : `${Math.round(attestation.ratio * 100)}%`}
                        </span>
                        {attestation.transactionHash && (
                          <a
                            href={`${explorer}/tx/${attestation.transactionHash}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-small text-ink-muted prose-link"
                          >
                            Transaction
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {knownDefects.length > 0 && (
              <details className="group rounded-md border border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-body-s [&::-webkit-details-marker]:hidden">
                  <span>How the measurers could be wrong</span>
                  <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-45">+</span>
                </summary>
                <ul className="hairline border-t border-line text-body-s text-ink-secondary">
                  {knownDefects.map((defect) => (
                    <li key={defect} className="px-4 py-2">
                      {defect}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          <Section id="work" title="Paid work" lead="Jobs funded against this agent through Pokter, and what came back.">
            <DefinitionList
              columns={2}
              dense
              items={[
                { term: 'Funded jobs', detail: history.jobs ? String(history.jobs) : 'None yet' },
                {
                  term: 'Completed',
                  detail: history.jobs ? `${history.completed} of ${history.jobs}` : '—',
                  note: history.rejected
                    ? `${history.rejected} contested`
                    : history.expired
                      ? `${history.expired} expired unfilled`
                      : undefined,
                },
                {
                  term: 'Delivers in',
                  detail: delivery.medianMs === null ? 'No delivery yet' : formatDelivery(delivery.medianMs),
                  note: delivery.samples ? `median of ${plural(delivery.samples, 'job')}` : undefined,
                },
                {
                  term: 'Buyer reviews',
                  detail: reviews.length
                    ? `${(reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)} of 5`
                    : 'None yet',
                  note: reviews.length ? plural(reviews.length, 'signed review') : 'Signed by buyers after settlement',
                },
              ]}
            />
            {sample && <DeliverySample sample={sample} />}
          </Section>

          <Section id="identity" title="Identity" lead="Read from the registry. For checking, not for deciding.">
            <DefinitionList
              dense
              items={[
                {
                  term: 'Registry id',
                  detail: (
                    <CopyableId
                      label="Identity"
                      value={`${agent.chain_id}:${agent.token_id}`}
                      display={`#${agent.token_id} · ${chainLabel(agent.chain_id)}`}
                    />
                  ),
                },
                {
                  term: 'Owner',
                  detail: <CopyableId label="Owner" value={agent.owner_address} display={shortAddress(agent.owner_address)} />,
                },
                {
                  term: 'Agent wallet',
                  detail: agent.agent_wallet ? (
                    <CopyableId label="Agent wallet" value={agent.agent_wallet} display={shortAddress(agent.agent_wallet)} />
                  ) : (
                    'Not published'
                  ),
                },
                {
                  term: 'Endpoint',
                  detail: live.endpoint ? <span className="mono break-all text-small">{live.endpoint}</span> : 'None published',
                  note: live.protocol !== 'none' ? live.protocol.toUpperCase() : undefined,
                },
                {
                  term: 'Explorer',
                  detail: (
                    <a
                      href={`${explorer}/address/${agent.contract_address}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="prose-link"
                    >
                      Registry contract on BscScan
                    </a>
                  ),
                },
              ]}
            />
          </Section>
        </div>

        {/*
          The decision, kept beside the evidence rather than at the end of
          it. Sticky because the reader is scrolling through reasons to say
          yes or no, and the control that acts on the answer should not
          require scrolling back.
        */}
        <aside className="sticky top-[68px] hidden flex-col gap-4 lg:flex" aria-label="Hire">
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
            <div>
              <p className="text-small text-ink-muted">{signedPrice ? 'Its signed price' : 'Starting budget, you set it'}</p>
              <p className="tabular mt-0.5 text-display font-semibold tracking-tight">{priceLabel}</p>
              {PAYMENT_VALUE_NOTE && <p className="text-caption text-ink-faint">{PAYMENT_VALUE_NOTE}</p>}
            </div>
            <DefinitionList
              dense
              items={[
                {
                  term: 'Delivers in',
                  detail: delivery.medianMs === null ? 'No delivery yet' : formatDelivery(delivery.medianMs),
                },
                { term: 'Delivered by', detail: deliveredByPokter ? 'Pokter’s seller, carrying your brief' : 'The agent itself' },
                { term: 'Wallet access', detail: <span className="font-medium text-positive">None</span> },
              ]}
            />
            <HireButton variant={recommendedNow ? 'primary' : 'caution'} block>
              {recommendedNow ? 'Hire' : 'Review risks and hire'}
            </HireButton>
            {!recommendedNow && (
              <p className="text-small leading-relaxed text-caution">
                {proof.recommendedForHire
                  ? 'Strong record, but it did not answer when this page loaded.'
                  : 'Below the bar. Hiring asks you to accept that in writing.'}
              </p>
            )}
            <p className="border-t border-line pt-3 text-small leading-relaxed text-ink-muted">
              Exactly the budget goes into escrow for this one job. It reaches the agent when you accept the delivery and
              comes back if nothing arrives.{' '}
              {agent.services?.a2a?.endpoint && (
                <a href="#try" className="text-ink prose-link">
                  Try it free first.
                </a>
              )}
            </p>
          </div>
          {alternatives.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas-subtle p-4">
              <p className="text-small font-medium">Stronger in this category</p>
              <ul className="flex flex-col gap-1.5 text-body-s">
                {alternatives.slice(0, 3).map((alternative) => (
                  <li key={alternative.listing.agent.token_id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/agents/${alternative.listing.agent.chain_id}/${alternative.listing.agent.token_id}`}
                      className="min-w-0 truncate text-ink prose-link"
                    >
                      {alternative.listing.agent.name}
                    </Link>
                    <span className="tabular shrink-0 text-small text-ink-muted">
                      {alternative.probes ? `${Math.round((alternative.answered / alternative.probes) * 100)}% of ${alternative.probes}` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <Suspense fallback={null}>
        <HireDrawer
          agent={{ chainId, tokenId, name: agent.name, category, wallet: agent.agent_wallet }}
          providers={providers}
          signedQuoteU={quote ? Number(quote.priceU) : null}
          riskWarnings={riskWarnings}
        />
      </Suspense>
    </div>
  );
}
