import type { Metadata } from 'next';
import { X402Island } from '@/features/x402/X402Island';
import { PayPerCallDeclared } from '@/features/x402/PayPerCallDeclared';
import { x402Enabled } from '@/lib/x402/flags';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { CHAIN_ID, chainLabel, explorerBaseFor } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { formatDelivery, formatMs, shortAddress } from '@/lib/ui/format';
import type { ChainId } from '@/lib/scan/types';
import { commissionTaskTemplates, templatesFromSkills } from '@/lib/hire/taskTemplates';
import { jobEvidencePath } from '@/lib/jobs/evidence-view';
import { clipAtWord } from '@/lib/ui/clip';
import { FollowButton, SaveButton, ShareButton } from '@/features/agent/AgentActions';
import { HirePanel, MobileHireBar } from '@/features/agent/HirePanel';
import { loadProfile, type AgentProfile } from '@/features/agent/profile';
import { TrialPanel } from '@/features/agent/TrialPanel';
import { AgentTabBar, AgentTabHint, AgentTabPanel } from '@/features/agent/AgentTabs';
import { ReportReview } from '@/features/agent/ReportReview';
import { LatencyTrend } from '@/features/studio/OpsCharts';
import { MoreActions, menuRow } from '@/features/agent/MoreActions';
import { CompareToggle, CompareTray } from '@/features/compare/CompareControls';
import { AgentAvatar, ProbeStrip, answerState } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { Breadcrumbs } from '@/ui/Controls';
import { Address, Details, Facts, Readout } from '@/ui/Data';
import { CategoryCheck } from '@/features/agent/CategoryCheck';
import { AnswerCheckSummary } from '@/features/agent/AnswerComparison';
import { answerComparison } from '@/lib/assay/comparison';
import { TestAgentPanel } from '@/features/proofrun/TestAgentPanel';
import { EmailLinkNotice } from '@/features/workspace/EmailLinkNotice';
import { EmptyState } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { VerdictChip, VerdictLabel } from '@/ui/Verdict';
import { MaturityLabel, MaturityLadder } from '@/ui/Maturity';
import { Rating } from '@/ui/Rating';
import { ConversionBeacon } from '@/features/conversion/ConversionBeacon';
import { isHouseAgent } from '@/lib/house/wallets';
import { BackToResults } from '@/features/discover/ReturnToResults';
import { agentJsonLd } from '@/lib/seo/agent-jsonld';
import { siteUrl } from '@/lib/site';
import { StructuredProfile } from '@/features/agent/StructuredProfile';
import { TradesForYouCard } from '@/features/trading/TradesForYouCard';
import { structuredProfile } from '@/features/agent/structured';
import { hireBlocker } from '@/lib/hire/blocker';

export const dynamic = 'force-dynamic';

/*
 * The escrow's own state names, in the words the rest of the page uses.
 * SUBMITTED is the one that misleads: it means the agent delivered and
 * the review window is running, not that something is pending on Pokter.
 */
/* The three answers a buyer signs, written out. "on-time" is a stored value,
   not a sentence, and a mark that says the delivery was late has to say it in
   the same voice as the two beside it. */
/* The explorer a job's own chain resolves to, named rather than assumed:
   a testnet job says testnet.bscscan.com because that is where its link goes. */
function explorerHost(chainId: number): string {
  return explorerBaseFor(chainId).replace('https://', '');
}

const REVIEW_SPEED: Record<string, string> = {
  early: 'Delivered early',
  'on-time': 'Delivered on time',
  late: 'Delivered late',
};

/**
 * One of the three answers a buyer signed, as a mark.
 *
 * Only the exception is coloured. A hirer scanning reviews is looking for the
 * one that went wrong, and it used to be the faintest text on the row: "Would
 * not hire again" sat in `text-ink-3`, quieter than the praise beside it.
 * Marking the yeses as well would make six good reviews a wall of green and
 * bury the one that is not, so a "yes" stays quiet and a "no" carries `watch`.
 */
function ReviewMark({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-full border px-2.5 text-[12.5px] font-medium',
        ok ? 'border-rule-strong bg-sunken text-ink-2' : 'border-watch bg-watch-wash text-watch',
      )}
    >
      {children}
    </span>
  );
}

const JOB_STATE: Record<string, string> = {
  FUNDED: 'Funded, not delivered yet',
  SUBMITTED: 'Delivered, in review',
  COMPLETED: 'Settled',
  EXPIRED: 'Expired, reclaimed',
  REJECTED: 'Disputed',
};

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
  // The evidence step, the same word the page leads with; availability follows in the description.
  const title = `${p.name} — ${p.maturity.label}`;
  const description = `${p.summary} ${p.maturity.label}. Availability: ${p.verdict.label.toLowerCase()}, ${measured}.`.slice(0, 300);
  const url = `/agents/${p.chainId}/${p.tokenId}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: 'profile' } };
}

function pct(n: number | null | undefined) {
  return n === null || n === undefined ? '—' : `${(n * 100).toFixed(n === 1 ? 0 : 1)}%`;
}

function Section({ id, label, title, children, aside }: { id: string; label: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`}>
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

/**
 * The four numbers worth having before anything else on the dossier.
 *
 * Each carries its own scope underneath, because these are not comparable
 * to each other and the scopes are genuinely different: one is lifetime
 * escrow, one is every check ever made, one is a 30-day median, one is a
 * sample of deliveries. A strip of bare figures invites the reader to treat
 * them as one measurement of one thing.
 *
 * There is no score here, and there will not be. The pattern this follows
 * ends with a composite reputation out of 100; Pokter does not publish one,
 * for the reason `ui/Rating.tsx` gives about aggregates - a number that
 * looks measured and is not is worse than no number, and it is the specific
 * claim this whole product exists to refuse.
 */
function HeadlineStats({ p }: { p: AgentProfile }) {
  const month = p.record.windows.find((w) => w.label === '30d');
  const replies = p.record.totalProbes > 0 ? p.record.totalAnswered / p.record.totalProbes : null;
  /*
   * Each figure beside what is typical on Pokter: the median across listed
   * agents that have the reading, never fewer than five (`lib/benchmark`).
   * How many agents it is drawn from is on hover, so the norm carries its
   * own denominator. Delivery time has none: timing a delivery is a chain
   * read per job, too costly to make for every agent on every view.
   */
  const bench = p.benchmark;
  const settled = bench?.platform.settledRate;
  const replyNorm = bench?.platform.replyRate;
  const msNorm = bench?.platform.replyMs;
  // Whole percentages: a tenth of a point is noise beside a median of a few dozen agents.
  const whole = (v: number) => `${Math.round(v * 100)}%`;
  const stats: Array<{ label: string; value: string; note: string; muted?: boolean; norm?: { text: string; title: string } }> = [
    {
      label: 'Paid jobs',
      value: String(p.history.jobs),
      note: p.history.jobs ? `${p.history.delivered} delivered` : 'None funded yet',
      muted: !p.history.jobs,
      norm: settled
        ? {
            text: bench?.own.settledRate != null ? `Settled ${whole(bench.own.settledRate)} · typical ${whole(settled.median)}` : `Typical agent settles ${whole(settled.median)}`,
            title: `Of finished paid jobs (settled or missed), the share that settled. Typical is the median of ${settled.agents} listed agents with a finished job.`,
          }
        : undefined,
    },
    {
      label: 'Replies',
      value: replies === null ? '\u2014' : pct(replies),
      note: p.record.totalProbes ? `${p.record.totalProbes} checks, lifetime` : 'Never called',
      muted: replies === null,
      norm: replyNorm ? { text: `Typical ${whole(replyNorm.median)}`, title: `Median lifetime reply rate of ${replyNorm.agents} listed agents Pokter has checked at least 10 times.` } : undefined,
    },
    {
      label: 'Response',
      value: month?.medianMs ? formatMs(month.medianMs) : '\u2014',
      note: month?.probes ? 'median, last 30 days' : 'nothing answered in 30 days',
      muted: !month?.medianMs,
      norm: msNorm ? { text: `Typical ${formatMs(msNorm.median)}`, title: `Median 30-day reply time of ${msNorm.agents} listed agents that answered in the last 30 days.` } : undefined,
    },
    {
      label: 'Delivers',
      value: p.delivery.medianMs ? formatDelivery(p.delivery.medianMs) : '\u2014',
      note: p.delivery.samples ? `${p.delivery.samples} timed on chain` : 'No deliveries timed',
      muted: !p.delivery.medianMs,
    },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-[14px] border border-rule bg-raised sm:grid-cols-4">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={cn(
            'flex min-w-0 flex-col gap-1 p-4 sm:p-5',
            /* Rules between, never around: the container already has one. */
            i % 2 === 1 && 'border-l border-rule',
            i >= 2 && 'border-t border-rule sm:border-t-0',
            i >= 1 && 'sm:border-l sm:border-rule',
          )}
        >
          <dt className="t-label">{stat.label}</dt>
          <dd className={cn('t-readout text-[1.5rem] leading-none tracking-[-0.02em]', stat.muted ? 'text-ink-3' : 'text-ink')}>{stat.value}</dd>
          <dd className="text-[12px] leading-snug text-ink-3">{stat.note}</dd>
          {stat.norm && (
            <dd className="mt-1.5 border-t border-rule pt-1.5 text-[11.5px] leading-snug text-ink-2" title={stat.norm.title}>
              {stat.norm.text}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function ClaimVsObserved({ p }: { p: AgentProfile }) {
  const month = p.record.windows.find((w) => w.label === '30d');
  const week = p.record.windows.find((w) => w.label === '7d');
  const day = p.record.windows.find((w) => w.label === '24h');
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule md:grid-cols-3">
      <div className="flex flex-col gap-3 bg-raised p-5">
        <span className="t-label flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-ink-3" /> It claims
        </span>
        <p className="text-[13.5px] leading-relaxed text-ink-2">Declared by the operator. Not checked by anyone.</p>
        <ul className="flex flex-col gap-1.5 text-[13px]">
          <li>{p.category ? `${p.category.label} agent` : 'No category Pokter recognises'}</li>
          {/* "on its card" is false for an agent that publishes only MCP. */}
          <li>
            {p.skillSource === 'mcp'
              ? `${p.skills.length} tool${p.skills.length === 1 ? '' : 's'} on its MCP endpoint`
              : p.skills.length > 0
                ? `${p.skills.length} declared skill${p.skills.length === 1 ? '' : 's'}`
                : p.services.some((s) => s.name.toLowerCase() === 'mcp')
                  ? 'No tools on its MCP endpoint'
                  : 'No skills declared on its card'}
          </li>
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
            <li>{p.evidence.independentAuthors.length > 0 ? `Independent authors: ${p.evidence.independentAuthors.slice(0, 3).map(shortAddress).join(', ')}` : 'No independently verified author wallet'}</li>
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
  // The agent's own example first, as on the hire page; Pokter's category wording only when it declares none.
  const declaredTemplates = templatesFromSkills(p.skills);
  const templates = declaredTemplates.length > 0 ? declaredTemplates : commissionTaskTemplates(p.category?.id ?? 'unclassified');
  const explorer = explorerBaseFor(p.chainId);
  const checkComparison = answerComparison(p.categoryCheck?.run ?? null);

  /*
   * The only page that says what a particular agent is, and until now the
   * only one a machine could not read as anything but prose. See
   * `agentJsonLd` for what is deliberately left out of it.
   */
  const jsonLd = agentJsonLd(siteUrl(), {
    name: p.name,
    summary: p.summary,
    chainId: p.chainId,
    tokenId: p.tokenId,
    owner: p.owner,
    imageUrl: p.imageUrl,
    categoryLabel: p.category?.label ?? null,
    record: { totalProbes: p.record.totalProbes, totalAnswered: p.record.totalAnswered },
    quote: p.quote
      ? { priceU: p.quote.priceU, currency: p.quote.currency, expiresAt: p.quote.expiresAt, payable: p.quote.payable }
      : null,
  });

  return (
    <div className="pb-32 lg:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <ConversionBeacon event="listing_viewed" chainId={p.chainId} tokenId={p.tokenId} />
      {/* Identity band */}
      <div className="border-b border-rule bg-raised/50">
        <div className="frame pb-8 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Breadcrumbs
              items={[
                { href: '/discover', label: 'Discover' },
                ...(p.category ? [{ href: `/discover?category=${p.category.id}`, label: p.category.label }] : []),
                { label: p.name },
              ]}
            />
            <BackToResults />
          </div>
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-5">
              {/* Two readings, answering different questions: the ring is
                  this page load, the dot is the record behind it. An agent
                  can answer right now and have answered nothing for a
                  month, and that is worth seeing without scrolling. */}
              <AgentAvatar
                name={p.name}
                imageUrl={p.imageUrl}
                seed={p.key}
                size={76}
                className="rounded-[16px]"
                eager
                status={answerState({ sinceAnswer: p.sinceAnswer })}
                live={{
                  answered: p.live.answered,
                  label: p.live.answered
                    ? `Answering now${p.live.medianMs ? ` \u00b7 ${formatMs(p.live.medianMs)}` : ''}`
                    : 'No answer just now',
                }}
              />
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
                  <MaturityLabel maturity={p.maturity} className="h-7 py-0" />
                  <VerdictChip verdict={p.verdict.id} prefix="Availability" />
                  {/* Said where a reader judges the agent: Pokter runs it, and does not feature it. */}
                  {isHouseAgent({ owner_address: p.owner, agent_wallet: p.agentWallet }) && (
                    <span
                      className="inline-flex h-7 items-center rounded-full border border-rule-strong bg-sunken px-2.5 text-[12.5px] font-medium text-ink-2"
                      title="Pokter runs this agent from its own wallet. It is measured like any other and never placed in Pokter’s picks or spotlight."
                    >
                      Run by Pokter
                    </span>
                  )}
                  {/*
                    The live check is the ring around the picture now, which
                    is read before any of these chips and leaves the row to
                    the facts that do not change between page loads. The
                    sentence it replaced is that ring's title, and is still
                    in the accessibility tree.
                  */}
                  {/*
                    "Hired on BNB Testnet · test tokens" was here. The hire
                    panel says it four times over — the network row, "On
                    BNB Testnet", "Test tokens only" and "escrowed on" —
                    and it renders at every width, in the sidebar on wide
                    screens and under the content on narrow ones. This chip
                    was the fifth, in the row a reader scans first.

                    It is still said somewhere a buyer cannot miss it: the
                    panel they fund from. That was the condition for
                    removing it, not that it was repetitive.
                  */}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <FollowButton chainId={p.chainId} tokenId={p.tokenId} name={p.name} compact />
              <SaveButton agent={{ chainId: p.chainId, tokenId: p.tokenId, name: p.name, imageUrl: p.imageUrl, category: p.category?.id ?? 'unclassified', description: p.summary }} compact />
              <MoreActions label={`More for ${p.name}`}>
                <ShareButton title={p.name} path={path} className={menuRow} />
                <CompareToggle agentKey={p.key} className={menuRow} />
              </MoreActions>
            </div>
          </div>
          <p className="t-lede mt-6 max-w-3xl">{p.summary}</p>
          <Suspense>
            <EmailLinkNotice kind="agents" className="mt-6 max-w-3xl" />
          </Suspense>
        </div>
      </div>

      <AgentTabHint />
      <AgentTabBar />

      <div className="frame grid grid-cols-1 gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div id="agent-tab-panels" className="flex min-w-0 flex-col gap-14">
          {/* Overview */}
          <AgentTabPanel id="overview">
          <section aria-labelledby="overview-title" className="flex flex-col gap-8">
            {/* Every other tab names what it is showing; this one labelled
                itself only for screen readers, so the first tab was the one
                with no heading on it. */}
            <div className="flex flex-col gap-1.5">
              <span className="t-label">Overview</span>
              <h2 id="overview-title" className="t-h2">
                What this agent is, and how it has behaved
              </h2>
            </div>
            <HeadlineStats p={p} />
            {/* The answer check in two lines, the full comparison one click away in Evidence. */}
            {checkComparison && <AnswerCheckSummary label={p.categoryCheck!.definition.label} comparison={checkComparison} />}
            {/* The five questions a buyer arrives with, each labelled with
                who answered it. The operator's description lives here now,
                under "What it does", with the same unverified label. */}
            <StructuredProfile s={structuredProfile(p)} sampleAnchor="sample" onChain={p.onChain} />
            {p.category && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {/*
                  "What it does" printed the category's blurb as a statement
                  about this agent. Centreline reviews a concentrated-liquidity
                  position and the classifier placed it in rebalancing, so its
                  page said it "reports how far your weights have drifted" —
                  work it does not do. Every agent whose job sits off its
                  category's centre read the same way.

                  The blurb stays — it is accurate about the category and
                  useful for orientation — but it is labelled as the
                  category and attributed to whoever put the agent in it: a
                  tag the operator wrote, or Pokter reading their prose.
                  `categorySignalSource` already draws that line and the
                  reason is in its own note: a claim about provenance is the
                  one kind this product cannot get wrong.

                  Nothing is synthesised from the declared skills to fill
                  this slot. The paid skill is the negotiate skill, so its
                  description is about quoting and refusal — Centreline's
                  reads "a brief this agent cannot answer is declined here"
                  — and guessing among the rest would replace a wrong
                  statement with an arbitrary one. The operator's own
                  account of the work is directly above, under "What it
                  does", where it is marked unverified.
                */}
                <div className="flex flex-col gap-1.5">
                  <span className="t-label">What this category does</span>
                  <p className="text-[15px] leading-relaxed">{p.category.blurb}</p>
                  <p className="text-[12px] text-ink-3">
                    Pokter&rsquo;s description of {p.category.label.toLowerCase()}, not this
                    agent&rsquo;s own.{' '}
                    {p.category.source === 'declared'
                      ? 'Its operator declared this category.'
                      : p.category.source === null
                        ? 'Pokter placed it here.'
                        : `Pokter placed it here from its ${p.category.source}.`}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="t-label">The question to ask it</span>
                  <p className="text-[15px] leading-relaxed text-ink-2">{p.category.question}</p>
                </div>
              </div>
            )}

            {p.skills.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="t-label">{p.skillSource === 'mcp' ? 'Tools it serves' : 'Declared skills'}</span>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {p.skills.map((s) => (
                    <li key={s.name} className="rounded-[10px] border border-rule bg-raised px-4 py-3">
                      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="t-readout text-[13px] font-medium">{s.name}</span>
                        {s.kind !== 'capability' && <span className="t-label text-ink-3">{s.kind === 'paid' ? 'Paid job' : 'Free preview'}</span>}
                      </p>
                      {s.description && (s.description.length <= 220 ? (
                        <p className="mt-1 text-[13px] leading-snug text-ink-3">{s.description}</p>
                      ) : (
                        /* Long operator text opens in place rather than stopping mid-sentence. */
                        <details className="group mt-1 text-[13px] leading-snug text-ink-3">
                          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            <span className="group-open:hidden">{clipAtWord(s.description, 200)} </span>
                            <span className="font-medium text-ink-2 underline-offset-2 hover:underline group-open:hidden">Show all</span>
                            <span className="hidden font-medium text-ink-2 group-open:inline">Show less</span>
                          </summary>
                          <p className="mt-1 whitespace-pre-line">{s.description}</p>
                        </details>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="t-label">Evidence</span>
                  <p className="mt-1 text-[13px] text-ink-2">{p.maturity.summary}</p>
                </div>
                <Link href="/methodology#maturity" className="text-[12.5px] font-medium text-ink-2 hover:text-ink hover:underline">How each step is earned</Link>
              </div>
              <MaturityLadder maturity={p.maturity} />
              <p className="text-[11.5px] leading-relaxed text-ink-3">Each step is something Pokter has seen this agent do. Availability ({p.verdict.label.toLowerCase()}) is judged separately, from Pokter&rsquo;s probes and third-party attestations, and says nothing about whether its answers are right.</p>
            </div>
            {p.sample && (
              <div id="sample" className="scroll-mt-32 flex flex-col gap-3">
                <span className="t-label">{p.sample.kind === 'lifecycle' ? 'A lifecycle demonstration, not an answer' : 'A real delivery'}</span>
                {p.sample.kind === 'lifecycle' && (
                  <p className="text-[13px] text-ink-2">
                    This job proved that funding, delivery and settlement work end to end. Pokter&rsquo;s seller submitted a receipt, and nothing in it came from this agent, so it says nothing about whether the agent can do the task.
                  </p>
                )}
                <div className="overflow-hidden rounded-[12px] border border-rule bg-raised">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-5 py-3 text-[12.5px] text-ink-3">
                    <span>
                      <Link href={jobEvidencePath(p.sample)} className="underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink">
                        Job <span className="t-readout">#{p.sample.jobId}</span>
                      </Link>{' '}
                      · {p.sample.status.toLowerCase()}
                      {p.sample.funder === 'team' ? ' · Pokter’s test hire' : p.sample.funder === 'outside' ? ' · an outside buyer’s job, answer published by the buyer' : p.sample.funder === 'self' ? ' · a self-hire, brief not shown' : ''}
                      {p.sample.kind === 'relayed'
                        ? ' · carried by Pokter’s delivery agent: the task went to this agent and its answer is shown unchanged'
                        : p.sample.kind === 'lifecycle'
                          ? ' · receipt submitted by Pokter’s seller, with no answer from the agent'
                          : p.sample.producer
                            ? ` · produced by ${p.sample.producer}`
                            : ''}
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
                        <div key={f.label} className="grid grid-cols-1 gap-1 sm:grid-cols-[160px_minmax(0,1fr)]">
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
                  <h3 className="t-h3">Check task and price, free</h3>
                  <p className="text-[13.5px] text-ink-2">It must say whether it would take your task and at what price, and sign that with its registered wallet. This is a price, not the work itself: the work comes once a job is funded.</p>
                </div>
                <TrialPanel agent={{ chainId: p.chainId, tokenId: p.tokenId, name: p.name }} defaultTask={templates[0]?.task ?? 'Produce a read-only assessment. State every assumption and data source; execute no transaction.'} />
              </div>
            )}
            {/* While x402 is off: what the registration declares, as a route Pokter does not take payments on. Streamed, so a slow registration never holds the page. */}
            {!x402Enabled() && p.chainId === 56 && (
              <Suspense fallback={null}>
                <PayPerCallDeclared chainId={p.chainId} tokenId={p.tokenId} />
              </Suspense>
            )}
            {/* Off unless the operator turns x402 on; then only for agents on the one network it supports. */}
            {x402Enabled() && p.chainId === 56 && (
              <div id="pay-per-call" className="scroll-mt-32 flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5 sm:p-6">
                <div className="flex flex-col gap-1">
                  <span className="t-label">Pay per call (x402)</span>
                  <h3 className="t-h3">One answer, paid directly</h3>
                </div>
                <X402Island chainId={p.chainId} tokenId={p.tokenId} agentName={p.name} />
              </div>
            )}
          </section>

          </AgentTabPanel>

          {/* Evidence */}
          <AgentTabPanel id="evidence">
          <Section id="evidence" label="Evidence" title="What is known, and what is not" aside={<VerdictLabel verdict={p.verdict.id} />}>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2 rounded-[12px] border border-rule bg-paper px-5 py-4">
                <p className="text-[14px] font-medium">{p.verdict.meaning}</p>
                <p className="text-[13.5px] leading-relaxed text-ink-2">{p.verdict.rationale}</p>
              </div>
              <div className="flex flex-col gap-3">
                <span className="t-label">Observed, one fact at a time</span>
                <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-2">
                  {p.readiness.map((row) => (
                    <div key={row.id} className="flex flex-col gap-1 bg-raised px-4 py-3">
                      <dt className="text-[12px] text-ink-3">{row.label}</dt>
                      <dd className="flex flex-col gap-0.5">
                        <span className={`text-[14px] font-medium ${row.tone === 'ok' ? 'text-ok' : row.tone === 'watch' ? 'text-watch' : row.tone === 'bad' ? 'text-bad' : 'text-ink'}`}>{row.value}</span>
                        <span className="text-[12.5px] leading-snug text-ink-3">{row.detail}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <ClaimVsObserved p={p} />
              {p.categoryCheck && (
                <div id="answer-check" className="scroll-mt-32">
                  <CategoryCheck definition={p.categoryCheck.definition} run={p.categoryCheck.run} agentKey={`${p.chainId}:${p.tokenId}`} />
                </div>
              )}
              {/*
                ProofRun, on the agents it can actually check.
                Offered only to `health-factor` agents: the scenarios are
                Venus Core Pool positions, and on a grid-trading agent every
                run would print "could not verify" — which a reader takes as
                a failed check rather than as a check that does not apply.
                The same reasoning is written into `venusHealthJob`.
              */}
              {p.category?.id === 'health-factor' && (
                <div id="proofrun" className="scroll-mt-32 rounded-[14px] border border-rule bg-raised p-5 sm:p-6">
                  <TestAgentPanel agent={{ chainId: p.chainId, tokenId: p.tokenId, name: p.name }} />
                </div>
              )}
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-label">Daily answer rate, last 30 days</span>
                  <span className="text-[12px] text-ink-3">Grey ticks: not probed that day</span>
                </div>
                {p.corrections.map((c) => (
                  <p key={c.rule} className="rounded-[10px] border border-rule bg-paper px-3 py-2 text-[12.5px] leading-snug text-ink-2">
                    <span className="font-medium text-ink">{c.count} earlier probe{c.count === 1 ? '' : 's'} left out as Pokter’s own error.</span> {c.reason} The raw rows are kept.
                  </p>
                ))}
                {p.record.totalProbes > 0 ? (
                  <ProbeStrip cells={p.record.cells} className="h-10 [&>span]:w-full [&>span]:flex-1" label="Daily answer rate, last 30 days" />
                ) : (
                  <p className="text-[13px] text-ink-3">No scheduled checks yet. An agent enters the schedule once it is listed, enrolled, has signed a price or has been hired.</p>
                )}
                <div className="grid grid-cols-2 gap-4 pt-2 sm:grid-cols-4">
                  <Readout label="Answered" value={`${p.record.totalAnswered}/${p.record.totalProbes}`} />
                  <Readout label="Watched for" value={`${Math.round(p.record.observedDays)} d`} />
                  <Readout label="Reply just now" value={p.live.medianMs ? formatMs(p.live.medianMs) : '—'} muted={!p.live.medianMs} />
                  <Readout label="Longest outage" value={p.record.longestOutage ? `${Math.max(1, Math.round((Date.parse(p.record.longestOutage.to) - Date.parse(p.record.longestOutage.from)) / 3_600_000))} h` : 'None'} muted={!p.record.longestOutage} />
                </div>
              </div>

              {p.latency.length >= 2 && <LatencyTrend points={p.latency} />}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              {p.defectsByMeasurer.length > 0 && (
                <Details summary={`Known limits of the measurement (${p.defectsByMeasurer.reduce((n, g) => n + g.defects.length, 0)})`}>
                  <div className="flex flex-col gap-4">
                    {p.defectsByMeasurer.map((group) => (
                      <div key={group.measurer} className="flex flex-col gap-1.5">
                        <span className="text-[12.5px] font-medium text-ink">
                          {group.measurer === 'Pokter' ? 'Pokter’s own' : `Disclosed by ${group.measurer}`}
                        </span>
                        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-ink-2">
                          {group.defects.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
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

          </AgentTabPanel>

          {/* Work and reviews */}
          <AgentTabPanel id="work">
          <Section id="work" label="Track record" title="Paid work and reviews">
            <div className="flex flex-col gap-8">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Readout label="Jobs funded" value={p.history.jobs} note={p.history.pending ? `${p.history.pending} still inside the deadline` : 'Through Pokter escrow'} />
                <Readout
                  label="Delivered"
                  value={p.history.jobs - p.history.pending - p.history.refused > 0 ? `${p.history.delivered} of ${p.history.jobs - p.history.pending - p.history.refused}` : '—'}
                  note={p.history.completed ? `${p.history.completed} settled` : p.history.jobs ? 'None settled yet' : 'No jobs yet'}
                  muted={!p.history.delivered}
                />
                <Readout
                  label="Missed deadline"
                  value={p.history.missed}
                  note={[
                    p.history.missed ? 'Funded, nothing delivered in time' : 'None missed',
                    p.history.refused ? `${p.history.refused} refused when funded, not counted` : null,
                    /*
                     * Said, not hidden. A trial Pokter's own wallet owed and
                     * failed to deliver is Pokter's miss; leaving it out of
                     * the agent's count without saying so would replace one
                     * silent misattribution with another.
                     */
                    p.history.operatorMissed
                      ? `${p.history.operatorMissed} Pokter delivered on its behalf and missed, not counted`
                      : null,
                  ].filter(Boolean).join(' · ')}
                  muted={!p.history.missed}
                  className={p.history.missed ? '[&>span:nth-child(2)]:text-watch' : undefined}
                />
                <Readout label="Median delivery" value={p.delivery.medianMs ? formatDelivery(p.delivery.medianMs) : '—'} note={p.delivery.samples ? `${p.delivery.samples} sampled` : 'No deliveries timed'} muted={!p.delivery.medianMs} />
                <Readout label="On time" value={p.delivery.onTime !== null ? pct(p.delivery.onTime) : '—'} muted={p.delivery.onTime === null} />
              </div>
              {/*
                The jobs behind the figures above. Five totals with none of
                the work under them could not be checked without leaving
                the page, and every row here carries the id the escrow
                knows it by.
              */}
              {p.jobHistory.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="t-label">Jobs funded through escrow</h3>
                    <span className="text-[12px] text-ink-3">
                      {p.jobHistory.length === p.history.jobs ? 'All of them' : `Newest ${p.jobHistory.length} of ${p.history.jobs}`}
                    </span>
                  </div>
                  <ol className="ruled overflow-hidden rounded-[12px] border border-rule">
                    {p.jobHistory.map((job) => (
                      <li key={`${job.chainId}:${job.jobId}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
                        <span className={cn('size-1.5 shrink-0 rounded-full', job.status === 'COMPLETED' ? 'bg-ok' : job.status === 'EXPIRED' || job.status === 'REJECTED' ? 'bg-watch' : job.delivered ? 'bg-ok' : 'bg-rule-strong')} aria-hidden />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium">{JOB_STATE[job.status] ?? job.status}</span>
                            <Link href={jobEvidencePath(job)} className="t-readout text-[11.5px] text-ink-3 underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink" title={`Job #${job.jobId}: what the escrow records and Pokter's check of the delivery`}>
                              #{job.jobId}
                            </Link>
                            {/* Said on the row, not inferred from a total: a job a
                                Pokter wallet delivered is not the agent's work. */}
                            {job.byOperator && <span className="text-[11.5px] text-watch">Pokter&rsquo;s wallet delivered this</span>}
                          </span>
                          <span className="text-[11.5px] text-ink-3">
                            {new Date(job.hiredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} · {chainLabel(job.chainId)}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="t-readout text-[13px]">{job.amountLabel}</span>
                          {/* Named for what it opens. A transaction is a receipt;
                              the escrow's read page is not, and calling it one
                              would be the claim this list exists to avoid. */}
                          <a
                            href={job.receipt.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="t-readout text-[11.5px] text-ink-3 underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink"
                            title={job.receipt.hash ? `Open this transaction on ${explorerHost(job.chainId)}` : `This job settled outside Pokter, so no transaction was recorded here. Read job #${job.jobId} from the escrow on ${explorerHost(job.chainId)}.`}
                          >
                            {job.receipt.hash ? `${job.receipt.hash.slice(0, 8)}\u2026` : 'Read in escrow'}
                          </a>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {p.reviews.length === 0 ? (
                <p className="rounded-[12px] border border-dashed border-rule-strong px-5 py-4 text-[13.5px] text-ink-2">
                  No reviews yet. On Pokter, only the wallet that funded a completed job can review it, and the review is signed by that wallet, so there are no anonymous ratings to show.
                </p>
              ) : (
                <ul className="ruled" aria-label="Reviews signed by the wallets that funded these jobs">
                  {p.reviews.slice(0, 6).map((r) => (
                    <li key={`${r.chainId}:${r.jobId}`} className="flex flex-col gap-1.5 py-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
                        <Rating value={r.rating} />
                        <span className="flex flex-wrap items-center gap-1.5">
                          <ReviewMark ok={r.deliveredAsPromised}>{r.deliveredAsPromised ? 'Delivered as promised' : 'Did not deliver as promised'}</ReviewMark>
                          <ReviewMark ok={r.speed !== 'late'}>{REVIEW_SPEED[r.speed] ?? r.speed}</ReviewMark>
                          <ReviewMark ok={r.wouldHireAgain}>{r.wouldHireAgain ? 'Would hire again' : 'Would not hire again'}</ReviewMark>
                        </span>
                      </div>
                      {r.comment && <p className="text-[14px] leading-relaxed">{r.comment.slice(0, 600)}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 text-[12px] text-ink-3">
                        <span>
                          Job <span className="t-readout">#{r.jobId}</span> · signed by the funding wallet <span className="t-readout">{r.buyer.slice(0, 6)}…{r.buyer.slice(-4)}</span>
                        </span>
                        {r.onchainTx && r.onchainChainId && (
                          <a href={`${explorerBaseFor(r.onchainChainId)}/tx/${r.onchainTx}`} target="_blank" rel="noreferrer noopener" className="link" title="Published to the ERC-8004 reputation registry by the buyer">
                            On chain
                          </a>
                        )}
                        <ReportReview chainId={r.chainId} jobId={r.jobId} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          </AgentTabPanel>

          {/* Pricing */}
          <AgentTabPanel id="pricing">
          <Section id="pricing" label="Pricing" title="What a job costs">
            {p.quote ? (
              <Facts
                rows={[
                  { label: p.quote.current ? 'Escrow quote' : 'Last signed escrow quote', value: <span className="t-readout">{p.quote.label}</span> },
                  /* The money, said once and plainly: a hire is funded in the
                     token the agent signed, so a buyer holding only $U has to
                     learn that here and not at the wallet. */
                  ...(p.pricesIn ? [{ label: 'Prices in', value: p.pricesIn.currencies.map((c) => c.symbol).join(', '), hint: p.pricesIn.sentence }] : []),
                  { label: 'Signed by', value: <Address address={p.quote.signer} chainExplorer={false} />, hint: 'Recovered from the signature; must match the registered agent wallet' },
                  { label: 'Signed', value: new Date(p.quote.quotedAt).toUTCString().slice(5, 22) + ' UTC' },
                  { label: 'Valid until', value: p.quote.expiresAt ? `${new Date(p.quote.expiresAt).toUTCString().slice(5, 22)} UTC${p.quote.current ? '' : ' (expired; Pokter asks for a fresh signed quote when you hire, and stops if it is above your budget)'}` : 'No expiry stated' },
                  /* The newest check beside the price it may have overtaken: a signed price shown alone read as current after a later check failed. */
                  ...(p.priceCheck && Date.parse(p.priceCheck.at) > Date.parse(p.quote.quotedAt)
                    ? [
                        {
                          label: 'Last price check',
                          value: `${new Date(p.priceCheck.at).toUTCString().slice(5, 22)} UTC · ${p.priceCheck.source === 'buyer' ? 'a buyer’s request' : 'Pokter’s scheduled check'} · ${p.priceCheck.outcome === 'signed' ? 'signed a price' : 'no signed price'}`,
                          hint: p.priceCheck.outcome === 'signed' ? undefined : hireBlocker({ code: p.priceCheck.outcome })?.reason,
                        },
                      ]
                    : []),
                  {
                    label: 'Payable by this escrow',
                    value: p.quote.payable === false
                      ? <span className="text-bad">No: signed in {p.quote.symbol ?? 'a token Pokter has not verified'}</span>
                      : <span className="text-ok">Yes, in {p.quote.symbol ?? 'its signed token'}</span>,
                    hint: p.escrowTokens.length
                      ? `The ${chainLabel(p.escrow.chainId)} escrow funds hires in ${p.escrowTokens.map((t) => t.symbol).join(', ')}.`
                      : undefined,
                  },
                  /* Pokter tops up gas only for a passkey wallet, which acts on CHAIN_ID and funds $U alone; every other hire's fee is the buyer's. */
                  {
                    label: 'Network fee',
                    value: `A few cents of ${p.escrow.chainId === 56 ? 'BNB' : 'tBNB'}, paid by your wallet`,
                    hint: p.escrow.chainId === CHAIN_ID && (p.quote.symbol ?? '$U') === '$U' ? 'Pokter tops it up for a passkey wallet that runs short.' : undefined,
                  },
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

          </AgentTabPanel>

          {/* Permissions */}
          <AgentTabPanel id="permissions">
          <Section id="permissions" label="Permissions" title="What hiring it asks of you">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          </AgentTabPanel>

          {/* Technical */}
          <AgentTabPanel id="technical">
          <Section id="technical" label="Technical" title="Identity and endpoints">
            <Facts
              rows={[
                { label: 'Registry', value: `ERC-8004 · ${chainLabel(p.chainId)}` },
                { label: 'Token ID', value: <span className="t-readout">#{p.tokenId}</span> },
                { label: 'Owner', value: <Address address={p.owner} chainExplorer={p.chainId === 97 || p.chainId === 56} chainId={p.chainId} /> },
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

          </AgentTabPanel>

          {p.alternatives.length > 0 && (
            <section aria-labelledby="alt-title" className="border-t border-rule pt-10">
              <h2 id="alt-title" className="t-label mb-4">
                Also measured in {p.category?.label ?? 'this category'}
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <TradesForYouCard chainId={p.chainId} tokenId={p.tokenId} />
          </div>
        </div>
      </div>
      <div className="frame mt-12 lg:hidden">
        <HirePanel profile={p} />
        <TradesForYouCard chainId={p.chainId} tokenId={p.tokenId} />
      </div>
      <MobileHireBar profile={p} />
      {/*
        The tray was rendered on Discover alone, so pressing Compare here
        stored the pick and showed nothing: the button said "Comparing" and
        the page was otherwise unchanged, with no count, no way to reach the
        comparison and no sign a second agent was needed. The selection
        already survives between pages by design — only the thing that says
        so was missing.
      */}
      <CompareTray />
    </div>
  );
}
