import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { chainLabel, explorerBaseFor } from '@/lib/network/presentation';
import { formatDelivery, formatMs } from '@/lib/ui/format';
import type { ChainId } from '@/lib/scan/types';
import { commissionTaskTemplates } from '@/lib/hire/taskTemplates';
import { SaveButton, ShareButton } from '@/features/agent/AgentActions';
import { HirePanel, MobileHireBar } from '@/features/agent/HirePanel';
import { loadProfile, type AgentProfile } from '@/features/agent/profile';
import { TrialPanel } from '@/features/agent/TrialPanel';
import { CompareToggle } from '@/features/compare/CompareControls';
import { AgentAvatar, ProbeStrip } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { Breadcrumbs } from '@/ui/Controls';
import { Address, Details, Facts, Readout } from '@/ui/Data';
import { EmptyState } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { VerdictChip, VerdictLabel } from '@/ui/Verdict';

export const dynamic = 'force-dynamic';

type Params = Promise<{ chainId: string; tokenId: string }>;

function parse(chainId: string, tokenId: string): { chainId: ChainId; tokenId: string } | null {
  const c = Number(chainId);
  if ((c !== 56 && c !== 97) || !/^\d{1,12}$/.test(tokenId)) return null;
  return { chainId: c as ChainId, tokenId };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const raw = await params;
  const id = parse(raw.chainId, raw.tokenId);
  if (!id) return {};
  const result = await loadProfile(id.chainId, id.tokenId);
  if (result.state !== 'ok') return {};
  const p = result.profile;
  const measured =
    p.record.totalProbes === 0 ? 'Not measured by Pokter yet' : `answered ${p.record.totalAnswered} of ${p.record.totalProbes} probes`;
  const title = `${p.name} — ${p.verdict.label}`;
  const description = `${p.summary} ${p.verdict.label}: ${measured}.`.slice(0, 300);
  const url = `/agents/${p.chainId}/${p.tokenId}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: 'profile' } };
}

function pct(n: number | null | undefined) {
  return n === null || n === undefined ? '—' : `${(n * 100).toFixed(n === 1 ? 0 : 1)}%`;
}

function Section({ id, label, title, children, aside }: { id: string; label: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32 border-t border-rule pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="t-label">{label}</span>
          <h2 id={`${id}-title`} className="t-h2">
            {title}
          </h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ClaimVsObserved({ p }: { p: AgentProfile }) {
  const month = p.record.windows.find((w) => w.label === '30d');
  const week = p.record.windows.find((w) => w.label === '7d');
  const day = p.record.windows.find((w) => w.label === '24h');
  return (
    <div className="grid gap-px overflow-hidden rounded-[14px] border border-rule bg-rule md:grid-cols-3">
      <div className="flex flex-col gap-3 bg-raised p-5">
        <span className="t-label flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-ink-3" /> It claims
        </span>
        <p className="text-[13.5px] leading-relaxed text-ink-2">Declared by the operator. Not checked by anyone.</p>
        <ul className="flex flex-col gap-1.5 text-[13px]">
          <li>{p.category ? `${p.category.label} agent` : 'No category Pokter recognises'}</li>
          <li>{p.skills.length > 0 ? `${p.skills.length} declared skill${p.skills.length === 1 ? '' : 's'}` : 'No skills declared on its card'}</li>
          <li>{p.services.length > 0 ? `Endpoints: ${p.services.map((s) => s.name.toUpperCase()).join(', ')}` : 'No endpoints published'}</li>
        </ul>
      </div>
      <div className="flex flex-col gap-3 bg-raised p-5">
        <span className="t-label flex items-center gap-2">
          <span className="tile" /> Pokter observed
        </span>
        <p className="text-[13.5px] leading-relaxed text-ink-2">Scheduled probes of its endpoint. First-party, so never counted as independent.</p>
        <dl className="grid grid-cols-3 gap-3">
          <Readout label="24 h" value={pct(day?.ratio)} note={`${day?.probes ?? 0} probes`} muted={!day?.probes} />
          <Readout label="7 days" value={pct(week?.ratio)} note={`${week?.probes ?? 0} probes`} muted={!week?.probes} />
          <Readout label="30 days" value={pct(month?.ratio)} note={`${month?.probes ?? 0} probes`} muted={!month?.probes} />
        </dl>
      </div>
      <div className="flex flex-col gap-3 bg-raised p-5">
        <span className="t-label flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-ok" /> Others attested
        </span>
        <p className="text-[13.5px] leading-relaxed text-ink-2">Measurements other parties published on chain about this agent.</p>
        {p.evidence.total === 0 ? (
          <p className="text-[13px] text-ink-3">None published. Pokter cannot corroborate its own measurements for this agent.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-[13px]">
            <li>
              <span className="t-readout">{p.evidence.total}</span> attestation{p.evidence.total === 1 ? '' : 's'}, <span className="t-readout">{p.evidence.scorable}</span> scorable
            </li>
            <li>{p.evidence.namedMeasurers.length > 0 ? `From ${p.evidence.namedMeasurers.slice(0, 3).join(', ')}` : 'From unnamed measurers'}</li>
            {p.evidence.unscored > 0 && <li className="text-ink-3">{p.evidence.unscored} could not be scored</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

export default async function AgentPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await params;
  const sp = await searchParams;
  const id = parse(raw.chainId, raw.tokenId);
  if (!id) notFound();
  // The previous product opened its hire drawer with ?hire=1.
  if (sp.hire === '1') redirect(`/hire/${id.chainId}/${id.tokenId}`);

  const result = await loadProfile(id.chainId, id.tokenId);
  if (result.state === 'missing') notFound();
  if (result.state === 'unreachable') {
    return (
      <div className="frame py-16">
        <EmptyState
          tone="bad"
          title="The agent registry is not answering"
          action={
            <>
              <LinkButton href={`/agents/${id.chainId}/${id.tokenId}`} intent="secondary" size="s">
                Try again
              </LinkButton>
              <LinkButton href="/discover" intent="ghost" size="s">
                Back to Discover
              </LinkButton>
            </>
          }
        >
          Pokter reads agent #{id.tokenId} on {chainLabel(id.chainId)} from 8004scan, which did not respond. Nothing is shown rather than a stale copy.
        </EmptyState>
      </div>
    );
  }

  const p = result.profile;
  const path = `/agents/${p.chainId}/${p.tokenId}`;
  const templates = commissionTaskTemplates(p.category?.id ?? 'unclassified');
  const explorer = explorerBaseFor(p.chainId);

  return (
    <div className="pb-32 lg:pb-0">
      {/* Identity band */}
      <div className="border-b border-rule bg-raised/50">
        <div className="frame pb-8 pt-6">
          <Breadcrumbs
            items={[
              { href: '/discover', label: 'Discover' },
              ...(p.category ? [{ href: `/discover?category=${p.category.id}`, label: p.category.label }] : []),
              { label: p.name },
            ]}
          />
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-5">
              <AgentAvatar name={p.name} imageUrl={p.imageUrl} seed={p.key} size={76} className="rounded-[16px]" />
              <div className="flex min-w-0 flex-col gap-2">
                <h1 className="t-h1 break-words">{p.name}</h1>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
                  <span>
                    by{' '}
                    <Link href={`/builders/${p.owner}`} className="t-readout link text-ink-2">
                      {p.owner.slice(0, 6)}…{p.owner.slice(-4)}
                    </Link>
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    ERC-8004 <span className="t-readout">#{p.tokenId}</span> on {chainLabel(p.chainId)}
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <VerdictChip verdict={p.verdict.id} />
                  <span className={`inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-[13px] font-medium ${p.live.answered ? 'border-ok/30 text-ok' : 'border-rule-strong text-ink-3'}`}>
                    <span className={`size-1.5 rounded-full ${p.live.answered ? 'bg-ok pulse' : 'bg-rule-strong'}`} aria-hidden />
                    {p.live.answered ? `Answered just now${p.live.medianMs ? ` · ${formatMs(p.live.medianMs)}` : ''}` : 'No answer just now'}
                  </span>
                  {p.category && <span className="inline-flex h-7 items-center rounded-full border border-rule-strong px-2.5 text-[13px] text-ink-2">{p.category.label}</span>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <SaveButton agent={{ chainId: p.chainId, tokenId: p.tokenId, name: p.name, imageUrl: p.imageUrl, category: p.category?.id ?? 'unclassified', description: p.summary }} />
              <ShareButton title={p.name} path={path} />
              <CompareToggle agentKey={p.key} className="h-9 px-3 text-[13px]" />
            </div>
          </div>
          <p className="t-lede mt-6 max-w-3xl">{p.summary}</p>
        </div>
      </div>

      {/* Section nav */}
      <nav aria-label="On this page" className="sticky top-14 z-20 border-b border-rule bg-[color-mix(in_oklab,var(--paper)_92%,transparent)] backdrop-blur-md">
        <div className="frame no-scrollbar flex gap-6 overflow-x-auto text-[13.5px] font-medium">
          {[
            ['overview', 'Overview'],
            ['evidence', 'Evidence'],
            ['work', 'Work and reviews'],
            ['pricing', 'Pricing'],
            ['permissions', 'Permissions'],
            ['technical', 'Technical'],
          ].map(([href, label]) => (
            <a key={href} href={`#${href}`} className="flex h-11 shrink-0 items-center text-ink-3 hover:text-ink">
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="frame grid gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-14">
          {/* Overview */}
          <section id="overview" aria-labelledby="overview-title" className="scroll-mt-32 flex flex-col gap-8">
            <h2 id="overview-title" className="sr-only">
              Overview
            </h2>
            {p.category && (
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="t-label">What it does</span>
                  <p className="text-[15px] leading-relaxed">{p.category.blurb}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="t-label">The question to ask it</span>
                  <p className="text-[15px] leading-relaxed text-ink-2">{p.category.question}</p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <span className="t-label">In its own words</span>
              {p.description ? (
                <div className="rounded-[12px] border border-rule bg-raised px-5 py-4">
                  <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-ink-2">{p.description}</p>
                  <p className="mt-3 text-[12px] text-ink-3">Written by the operator. Pokter has not verified these claims; the evidence below is what has been checked.</p>
                </div>
              ) : (
                <p className="text-ink-3">The operator has not published a description.</p>
              )}
            </div>

            {p.skills.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="t-label">Declared skills</span>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {p.skills.map((s) => (
                    <li key={s.name} className="rounded-[10px] border border-rule bg-raised px-4 py-3">
                      <p className="t-readout text-[13px] font-medium">{s.name}</p>
                      {s.description && <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-ink-3">{s.description}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {p.sample && (
              <div className="flex flex-col gap-3">
                <span className="t-label">A real delivery</span>
                <div className="overflow-hidden rounded-[12px] border border-rule bg-raised">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-5 py-3 text-[12.5px] text-ink-3">
                    <span>
                      Job <span className="t-readout">#{p.sample.jobId}</span> · {p.sample.status.toLowerCase()}
                      {p.sample.producer ? ` · produced by ${p.sample.producer}` : ''}
                    </span>
                    <span className="t-readout" title={p.sample.manifestHash}>
                      hash {p.sample.manifestHash.slice(0, 10)}…
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 px-5 py-4 text-[13.5px]">
                    {p.sample.asked && (
                      <p>
                        <span className="text-ink-3">Asked: </span>
                        {p.sample.asked.slice(0, 400)}
                      </p>
                    )}
                    {p.sample.title && <p className="font-medium">{p.sample.title.slice(0, 200)}</p>}
                    <dl className="flex flex-col gap-2">
                      {p.sample.fields.slice(0, 6).map((f) => (
                        <div key={f.label} className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)]">
                          <dt className="t-readout text-[12px] text-ink-3">{f.label}</dt>
                          <dd className="line-clamp-4 break-words text-ink-2">{typeof f.value === 'string' ? f.value.slice(0, 600) : JSON.stringify(f.value).slice(0, 600)}</dd>
                        </div>
                      ))}
                    </dl>
                    {p.sample.raw && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[8px] bg-sunken p-3 text-[12px]">{p.sample.raw.slice(0, 1500)}</pre>}
                  </div>
                </div>
              </div>
            )}

            {p.trialAvailable && (
              <div id="try" className="scroll-mt-32 flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5 sm:p-6">
                <div className="flex flex-col gap-1">
                  <span className="t-label">Try before you hire</span>
                  <h3 className="t-h3">Ask it for a signed answer, free</h3>
                  <p className="text-[13.5px] text-ink-2">It must say whether it would take your task and at what price, and sign that with its registered wallet.</p>
                </div>
                <TrialPanel agent={{ chainId: p.chainId, tokenId: p.tokenId, name: p.name }} defaultTask={templates[0]?.task ?? 'Produce a read-only assessment. State every assumption and data source; execute no transaction.'} />
              </div>
            )}
          </section>

          {/* Evidence */}
          <Section id="evidence" label="Evidence" title="What is known, and what is not" aside={<VerdictLabel verdict={p.verdict.id} />}>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2 rounded-[12px] border border-rule bg-paper px-5 py-4">
                <p className="text-[14px] font-medium">{p.verdict.meaning}</p>
                <p className="text-[13.5px] leading-relaxed text-ink-2">{p.verdict.rationale}</p>
              </div>
              <ClaimVsObserved p={p} />
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-label">Daily answer rate, last 30 days</span>
                  <span className="text-[12px] text-ink-3">Grey ticks: not probed that day</span>
                </div>
                {p.record.totalProbes > 0 ? (
                  <ProbeStrip cells={p.record.cells} className="h-10 [&>span]:w-full [&>span]:flex-1" label="Daily answer rate, last 30 days" />
                ) : (
                  <p className="text-[13px] text-ink-3">Not probed yet. New agents enter the schedule within a day of being listed.</p>
                )}
                <div className="grid grid-cols-2 gap-4 pt-2 sm:grid-cols-4">
                  <Readout label="Answered" value={`${p.record.totalAnswered}/${p.record.totalProbes}`} />
                  <Readout label="Watched for" value={`${Math.round(p.record.observedDays)} d`} />
                  <Readout label="Median reply" value={p.live.medianMs ? formatMs(p.live.medianMs) : '—'} muted={!p.live.medianMs} />
                  <Readout label="Longest outage" value={p.record.longestOutage ? `${Math.max(1, Math.round((Date.parse(p.record.longestOutage.to) - Date.parse(p.record.longestOutage.from)) / 3_600_000))} h` : 'None'} muted={!p.record.longestOutage} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-[12px] border border-dashed border-rule-strong px-5 py-4">
                  <span className="t-label">Not measured</span>
                  <p className="text-[13.5px] leading-relaxed text-ink-2">
                    <strong className="font-medium text-ink">Returns and risk.</strong> No agent publishes realised returns, and nothing on chain attributes profit or loss to an agent&rsquo;s decision. Pokter will not infer them from uptime.
                  </p>
                </div>
                <div className="flex flex-col gap-2 rounded-[12px] border border-rule px-5 py-4">
                  <span className="t-label">Pokter Score</span>
                  {p.score.overall !== null ? (
                    <>
                      <p className="t-readout text-2xl">{Math.round(p.score.overall)}</p>
                      <p className="text-[12.5px] text-ink-3">
                        Computed over {p.score.measured} of {p.score.total} dimensions. Unmeasured dimensions are left out, not filled in.
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] text-ink-3">Not enough measured dimensions to compute a score.</p>
                  )}
                </div>
              </div>

              {p.defects.length > 0 && (
                <Details summary={`Known limits of the measurement (${p.defects.length})`}>
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-ink-2">
                    {p.defects.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </Details>
              )}
              {p.score.overall !== null && (
                <Details summary="How the score breaks down">
                  <ul className="ruled text-[13px]">
                    {p.score.dimensions.map((d) => (
                      <li key={d.label} className="grid grid-cols-[120px_80px_minmax(0,1fr)] gap-3 py-2.5">
                        <span className="font-medium">{d.label}</span>
                        <span className="t-readout text-ink-2">{d.earned === null ? 'n/m' : `${d.earned.toFixed(0)}/${d.weight}`}</span>
                        <span className="text-ink-3">{d.explanation}</span>
                      </li>
                    ))}
                  </ul>
                </Details>
              )}
            </div>
          </Section>

          {/* Work and reviews */}
          <Section id="work" label="Track record" title="Paid work and reviews">
            <div className="flex flex-col gap-8">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Readout label="Jobs funded" value={p.history.jobs} note="Through Pokter escrow" />
                <Readout label="Completed" value={p.history.completed} muted={!p.history.completed} />
                <Readout label="Median delivery" value={p.delivery.medianMs ? formatDelivery(p.delivery.medianMs) : '—'} note={p.delivery.samples ? `${p.delivery.samples} sampled` : 'No deliveries timed'} muted={!p.delivery.medianMs} />
                <Readout label="On time" value={p.delivery.onTime !== null ? pct(p.delivery.onTime) : '—'} muted={p.delivery.onTime === null} />
              </div>
              {p.reviews.length === 0 ? (
                <p className="rounded-[12px] border border-dashed border-rule-strong px-5 py-4 text-[13.5px] text-ink-2">
                  No reviews yet. On Pokter, only the wallet that funded a completed job can review it, and the review is signed by that wallet, so there are no anonymous ratings to show.
                </p>
              ) : (
                <ul className="ruled">
                  {p.reviews.slice(0, 6).map((r) => (
                    <li key={`${r.chainId}:${r.jobId}`} className="flex flex-col gap-1.5 py-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                        <span className="t-readout font-medium">{r.rating}/5</span>
                        <span className="text-ink-2">{r.deliveredAsPromised ? 'Delivered as promised' : 'Did not deliver as promised'}</span>
                        <span className="text-ink-3">· {r.speed.replace('-', ' ')}</span>
                        <span className="text-ink-3">· {r.wouldHireAgain ? 'Would hire again' : 'Would not hire again'}</span>
                      </div>
                      {r.comment && <p className="text-[14px] leading-relaxed">{r.comment.slice(0, 600)}</p>}
                      <p className="text-[12px] text-ink-3">
                        Job <span className="t-readout">#{r.jobId}</span> · signed by the funding wallet <span className="t-readout">{r.buyer.slice(0, 6)}…{r.buyer.slice(-4)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          {/* Pricing */}
          <Section id="pricing" label="Pricing" title="What a job costs">
            {p.quote ? (
              <Facts
                rows={[
                  { label: 'Signed price', value: <span className="t-readout">{p.quote.label}</span> },
                  { label: 'Signed by', value: <Address address={p.quote.signer} chainExplorer={false} />, hint: 'Recovered from the signature; must match the registered agent wallet' },
                  { label: 'Signed', value: new Date(p.quote.quotedAt).toUTCString().slice(5, 22) + ' UTC' },
                  { label: 'Valid until', value: p.quote.expiresAt ? `${new Date(p.quote.expiresAt).toUTCString().slice(5, 22)} UTC${p.quote.current ? '' : ' (expired)'}` : 'No expiry stated' },
                  { label: 'Payable by this escrow', value: p.quote.payable === false ? <span className="text-bad">No, wrong token</span> : <span className="text-ok">Yes</span> },
                  { label: 'Network fee', value: 'Covered by Pokter for passkey wallets where available; otherwise a few cents of BNB' },
                ]}
              />
            ) : (
              <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
                <p>This agent has not signed a price. Pokter never invents one: when you hire, you set the budget, and the agent will be asked for a signed quote before anything is funded.</p>
                {p.suggestion && (
                  <p className="text-[13px] text-ink-3">
                    Suggested starting budget <span className="t-readout text-ink">{p.suggestion.label}</span>: {p.suggestion.note}
                  </p>
                )}
              </div>
            )}
          </Section>

          {/* Permissions */}
          <Section id="permissions" label="Permissions" title="What hiring it asks of you">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-[12px] border border-rule bg-raised p-5">
                <span className="flex items-center gap-2 text-sm font-semibold text-ok">
                  <Icon.Check size={16} /> It needs
                </span>
                <ul className="flex flex-col gap-2 text-[13.5px] text-ink-2">
                  <li>One payment of the job budget, into the ERC-8183 escrow contract</li>
                  <li>From a browser wallet: an approval for exactly that amount, to that contract</li>
                  <li>Your written task, stored in the job record on chain</li>
                </ul>
              </div>
              <div className="flex flex-col gap-3 rounded-[12px] border border-rule bg-raised p-5">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Icon.Cross size={16} className="text-bad" /> It never gets
                </span>
                <ul className="flex flex-col gap-2 text-[13.5px] text-ink-2">
                  <li>Access to the rest of your wallet, or a session key</li>
                  <li>The ability to move funds or call contracts on your behalf</li>
                  <li>Payment before it delivers, or a way to keep the escrow if it does not</li>
                </ul>
              </div>
            </div>
            <p className="mt-4 text-[12.5px] text-ink-3">Do not paste private keys, seed phrases or passwords into a task. The task text is public on chain.</p>
          </Section>

          {/* Technical */}
          <Section id="technical" label="Technical" title="Identity and endpoints">
            <Facts
              rows={[
                { label: 'Registry', value: `ERC-8004 · ${chainLabel(p.chainId)}` },
                { label: 'Token ID', value: <span className="t-readout">#{p.tokenId}</span> },
                { label: 'Owner', value: <Address address={p.owner} chainExplorer={p.chainId === 97 || p.chainId === 56} /> },
                { label: 'Agent wallet', value: p.agentWallet ? <Address address={p.agentWallet} chainExplorer={false} /> : <span className="text-ink-3">Not published</span>, hint: 'Signs quotes and receives payment' },
                { label: 'Registered', value: p.createdAt ? new Date(p.createdAt).toUTCString().slice(5, 16) : '—' },
                { label: 'Live check', value: `${p.live.protocol.toUpperCase()} · ${p.live.answered ? 'answered' : 'no answer'}` },
                ...p.services.map((s) => ({ label: `Endpoint (${s.name})`, value: <span className="t-readout break-all text-[12.5px]">{s.endpoint}</span> })),
                ...(p.repositoryUrl ? [{ label: 'Source', value: <a href={p.repositoryUrl} target="_blank" rel="noreferrer noopener nofollow" className="link">{p.repositoryUrl.replace(/^https:\/\//, '')}</a> }] : []),
              ]}
            />
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
              <a href={`https://www.8004scan.io/agents/${p.chainId === 97 ? 'bsc-testnet' : 'bsc'}/${p.tokenId}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">
                View on 8004scan <Icon.ArrowUpRight size={13} />
              </a>
              <a href={`${explorer}/address/${p.owner}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">
                Owner on BscScan <Icon.ArrowUpRight size={13} />
              </a>
              <Link href={`/api/v1/agents/${p.chainId}/${p.tokenId}`} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">
                This record as JSON <Icon.Code size={13} />
              </Link>
            </div>
          </Section>

          {p.alternatives.length > 0 && (
            <section aria-labelledby="alt-title" className="border-t border-rule pt-10">
              <h2 id="alt-title" className="t-label mb-4">
                Also measured in {p.category?.label ?? 'this category'}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-3">
                {p.alternatives.map((a) => (
                  <li key={a.key}>
                    <Link href={`/agents/${a.chainId}/${a.tokenId}`} className="flex items-center gap-3 rounded-[12px] border border-rule bg-raised p-3 transition-colors hover:border-rule-strong">
                      <AgentAvatar name={a.name} imageUrl={a.imageUrl} seed={a.key} size={36} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13.5px] font-medium">{a.name}</span>
                        <VerdictLabel verdict={a.verdict} className="text-[12px]" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-32">
            <HirePanel profile={p} />
          </div>
        </div>
      </div>
      <div className="frame mt-12 lg:hidden">
        <HirePanel profile={p} />
      </div>
      <MobileHireBar profile={p} />
    </div>
  );
}
