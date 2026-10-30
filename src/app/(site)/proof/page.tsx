import type { Metadata } from 'next';
import Link from 'next/link';

import {
  filterCurrentProductionJobs,
  summarizeProductionProof,
  type ProofFunder,
  type ProofWindow,
} from '@/lib/erc8183/production-proof';
import { getJobStore } from '@/lib/erc8183/store';
import { courierPaidTest } from '@/lib/erc8183/courier-paid';
import { fundingEvidence } from '@/lib/erc8183/funding-evidence';
import { jobAmountLabel } from '@/lib/erc8183/job-amount';
import { isLifecycleDemo } from '@/lib/agent/credited-history';
import { listSearchable } from '@/lib/marketplace';
import { registeredWalletRead } from '@/lib/registry/live-agent';
import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';
import { chainLabel, escrowMoney, explorerBaseFor } from '@/lib/network/presentation';
import { briefIsPublic, jobEvidencePath, jobFunder } from '@/lib/jobs/evidence-view';
import { answerIsPublic } from '@/lib/jobs/answer-publication';
import { escrowCommerceAddress } from '@/lib/erc8183/addresses';
import { jobReceipt } from '@/lib/jobs/receipt-link';
import { teamWalletList, teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';
import { cn } from '@/lib/ui/cn';
import { AgentAvatar } from '@/ui/Agent';
import { Icon } from '@/ui/icons';
import { WhyNumbersDiffer } from '@/features/proof/WhyNumbersDiffer';
import { CORRECTIONS } from '@/lib/corrections/entries';
import { outsideActivity } from '@/lib/erc8183/outside-activity';
import { CodeBlock } from '@/ui/Data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Production proof',
  description: 'Agents hired through Pokter, the answers they delivered and an on-chain receipt for every job, split by network and funding.',
  alternates: { canonical: '/proof' },
};

const STATUS_COPY: Record<JobStatusName, string> = {
  OPEN: 'Created',
  FUNDED: 'Funded',
  SUBMITTED: 'Delivered',
  COMPLETED: 'Settled',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

/* One network at a time: real and test money are never read as one population. */
type Network = 'mainnet' | 'testnet';
const NETWORK_WORD: Record<Network, string> = { mainnet: 'Mainnet', testnet: 'Testnet' };
/* Per group in the results list, one job per agent: a range of agents, not one agent's repeats. */
const RESULTS_PER_GROUP = 6;

interface Filters {
  network: Network;
  funder: ProofFunder;
  window: ProofWindow;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(raw: Record<string, string | string[] | undefined>): Omit<Filters, 'network'> & { network: Network | null } {
  const network = one(raw.network);
  const funder = one(raw.funder);
  const window = one(raw.window);
  return {
    network: network === 'mainnet' || network === 'testnet' ? network : null,
    /*
     * All activity by default, with the funding split printed beside every
     * total and outside-team results listed first, so team-funded jobs are
     * counted in plain view rather than hidden behind a filter. Each side
     * is one click away.
     */
    funder: funder === 'team' || funder === 'outside-team' ? funder : 'all',
    window: window === '7d' || window === '30d' ? window : 'all',
  };
}

function proofHref(filters: Filters, change: Partial<Filters>, agent: string | null = null): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams({ network: next.network });
  if (next.funder !== 'all') params.set('funder', next.funder);
  if (next.window !== 'all') params.set('window', next.window);
  if (agent) params.set('agent', agent);
  return `/proof?${params.toString()}`;
}

function FilterGroup<T extends string>({
  label,
  value,
  options,
  href,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  href: (value: T) => string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="t-label">{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-[10px] bg-sunken p-1">
        {options.map((option) => (
          <Link
            key={option.value}
            href={href(option.value)}
            scroll={false}
            aria-current={value === option.value ? 'true' : undefined}
            className={cn(
              'rounded-[7px] px-3 py-1.5 text-[13px] transition-colors',
              value === option.value ? 'bg-raised font-medium text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </fieldset>
  );
}

function Headline({ value, label, note, aside }: { value: number; label: string; note: string; aside?: string | null }) {
  return (
    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-x-3 bg-raised p-5 sm:flex sm:flex-col sm:items-start sm:gap-2 sm:p-6">
      <span className="t-readout row-span-3 text-[2rem] leading-none tracking-[-0.04em] sm:text-[2.4rem]">{value.toLocaleString('en-US')}</span>
      <span className="text-[14.5px] font-semibold text-ink">{label}</span>
      <span className="col-start-2 text-[13px] leading-snug text-ink-2">{note}</span>
      {aside && <span className="col-start-2 text-[12px] leading-snug text-ink-3">{aside}</span>}
    </div>
  );
}

function Metric({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="flex flex-col gap-3 border-t border-rule py-5 sm:pr-5">
      <span className="t-readout text-[1.6rem] leading-none tracking-[-0.03em]">{value}</span>
      <span>
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        <span className="mt-1 block text-[12px] leading-relaxed text-ink-3">{note}</span>
      </span>
    </div>
  );
}

function receiptLink(job: HiredJob): string {
  return jobReceipt(job, escrowCommerceAddress).href;
}

const agentOf = (job: HiredJob) => `${job.agentChainId ?? job.chainId}:${job.agentTokenId}` as const;

/** The newest job of each agent, newest first: the list shows how many agents delivered, not how often one did. */
function newestPerAgent(jobs: HiredJob[]): HiredJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(agentOf(job))) return false;
    seen.add(agentOf(job));
    return true;
  });
}

export default async function ProductionProofPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const parsed = parseFilters(raw);
  const agent = one(raw.agent);
  const agentKey = agent && /^\d+\:\d+$/.test(agent) ? agent : null;
  const team = teamWalletSet();
  const isTeam = (job: HiredJob) => fundedByTeam(job, team);
  const store = getJobStore();
  const indexed = store.all();
  const inView = (network: Network, funder: ProofFunder) =>
    filterCurrentProductionJobs(indexed, { network, funder, window: parsed.window }, isTeam)
      .filter((job) => !agentKey || agentOf(job) === agentKey)
      .sort((a, b) => b.hiredAt.localeCompare(a.hiredAt));
  const counts: Record<Network, number> = { mainnet: inView('mainnet', parsed.funder).length, testnet: inView('testnet', parsed.funder).length };
  /* BNB Chain unless chosen; a link that names no network and has nothing there (one agent's testnet receipts) opens on testnet. */
  const network: Network = parsed.network ?? (counts.mainnet === 0 && counts.testnet > 0 ? 'testnet' : 'mainnet');
  const filters: Filters = { ...parsed, network };
  const jobs = inView(network, filters.funder);
  /*
   * The courier was the provider, carrying the agent's answer, and the
   * escrow paid it in the agent's place. A job paid to a Pokter agent's own
   * registered wallet is that agent's paid work (`courierPaidTest`).
   * Counted apart and labelled on its row (`courierDeliveries`).
   */
  const paidToCourier = await courierPaidTest(jobs, team, registeredWalletRead);
  /* Both networks and outside the team only, whatever the filters below are set to: the sentence at the top is about Pokter, not about this view. */
  const outside = await outsideActivity();
  const summary = summarizeProductionProof(jobs, isTeam, isLifecycleDemo, paidToCourier);
  /*
   * The split beside the total is of funded hires (`fundingEvidence`), and
   * always of every funder, so a filtered view still says what it left out.
   */
  const everyFunder = (filters.funder === 'all' ? jobs : inView(network, 'all')).filter((job) => fundingEvidence(job) === 'funded');
  const outsideTeamHires = everyFunder.filter((job) => !isTeam(job)).length;
  const teamFundedHires = everyFunder.length - outsideTeamHires;
  const wallets = teamWalletList();
  /*
   * The agent's registry name, not the one written into each job: legacy
   * jobs recorded a seller label ("Verified testnet seller") or nothing, so
   * the same agent appeared under two names in one table.
   */
  const names = new Map(
    (await listSearchable({ limit: 400 }).catch(() => [])).map((entry) => [`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`, entry.listing.agent.name] as const),
  );
  const agentLabel = (job: HiredJob): { name: string; registered: boolean } => {
    if (!/^\d+$/.test(job.agentTokenId)) return { name: 'Early demo job', registered: false };
    const registry = names.get(agentOf(job));
    if (registry) return { name: registry, registered: true };
    const recorded = job.agentName && !/^verified testnet seller$/i.test(job.agentName) ? job.agentName : null;
    return { name: recorded ?? `Agent #${job.agentTokenId}`, registered: true };
  };
  const word = NETWORK_WORD[network];
  const unfiltered = filters.funder === 'all' && filters.window === 'all' && !agentKey;
  const testMoney = network === 'testnet';
  const rate = summary.completionRate === null ? '—' : `${Math.round(summary.completionRate * 100)}%`;

  const split =
    filters.funder === 'all'
      ? `${outsideTeamHires} outside-team · ${teamFundedHires} team-funded`
      : filters.funder === 'outside-team'
        ? `Outside-team only · ${teamFundedHires} team-funded in all activity`
        : `Team-funded only · ${outsideTeamHires} outside-team in all activity`;
  /* A job the escrow does not prove was funded is named, never counted as a hire. */
  const notHires = [
    summary.notFunded > 0 ? `${summary.notFunded} created, never funded` : null,
    summary.fundingUnproven > 0 ? `${summary.fundingUnproven} rejected, funding not proven` : null,
  ].filter(Boolean);
  const notHiresNote = notHires.length > 0 ? `Not counted: ${notHires.join(' · ')}` : null;

  /*
   * Results: jobs that delivered the agent's answer (`answersDelivered`),
   * newest per agent. Outside-team results come first in their own group,
   * so the work outside buyers funded is never under the team's repeats.
   */
  const delivered = jobs.filter((job) => (job.status === 'SUBMITTED' || job.status === 'COMPLETED') && !isLifecycleDemo(job));
  const groups = (filters.funder === 'all'
    ? [
        { id: 'outside', title: 'Funded outside the team', jobs: newestPerAgent(delivered.filter((job) => !isTeam(job))) },
        { id: 'team', title: 'Funded by Pokter’s team', jobs: newestPerAgent(delivered.filter(isTeam)) },
      ]
    : [{ id: filters.funder, title: null, jobs: newestPerAgent(delivered) }]
  ).filter((group) => group.jobs.length > 0);

  /* Settled value per chain and token, each in its own money: never one total over them. */
  const settledValue = summary.completedByToken.map((line) =>
    line.label && line.symbol
      ? testMoney ? `${line.label.slice(0, line.label.length - line.symbol.length).trim()} test ${line.symbol}` : line.label
      : `${line.jobs} job${line.jobs === 1 ? '' : 's'} in a currency not yet read`,
  );

  return (
    <div className="frame pb-24 pt-10 sm:pt-14">
      {/*
        The finding first, then where to check it.

        This opened on a display headline and a description of the page, and
        the figures a visitor came for were below the fold. It now leads with
        one sentence of them, outside buyers only and with how much is on BNB
        Chain, because most outside work so far is testnet and a total that
        hid that would flatter it. The verifier, which was at the foot of the
        page, sits beside it: the claim and the way to test it in one screen.
      */}
      <header className="grid grid-cols-1 gap-8 pb-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
        <div className="flex flex-col gap-4">
          <span className="t-label flex items-center gap-2"><span className="tile" aria-hidden /> Production proof</span>
          <h1 className="t-h1">Real jobs. Delivered answers.</h1>
          <p className="t-lede max-w-2xl">
            <span className="text-ink">
              {outside.answered.toLocaleString('en-US')} paid {outside.answered === 1 ? 'job has' : 'jobs have'} settled with the agent&rsquo;s answer for buyers outside Pokter&rsquo;s team
            </span>
            {outside.answered > 0 &&
              (outside.answeredMainnet === 0
                ? ', none on BNB Chain yet.'
                : outside.answeredMainnet === outside.answered
                  ? ', all on BNB Chain.'
                  : `, ${outside.answeredMainnet} of them on BNB Chain.`)}
            {outside.answered === 0 && '.'} {outside.buyers.wallets.toLocaleString('en-US')} outside {outside.buyers.wallets === 1 ? 'wallet has' : 'wallets have'} funded a job. Every job is below, the misses included.
          </p>
          <nav aria-label="About these figures" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/leaderboard" className="inline-flex items-center gap-1.5 font-medium hover:underline">
              Compare performance <Icon.Arrow size={14} />
            </Link>
            <Link href="/methodology" className="text-ink-2 hover:text-ink hover:underline">
              How we measure
            </Link>
            <Link href="/corrections" className="text-ink-2 hover:text-ink hover:underline">
              {CORRECTIONS.length} corrections, dated
            </Link>
          </nav>
        </div>
        <aside aria-labelledby="verify-title" className="flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5">
          <h2 id="verify-title" className="text-[15px] font-semibold tracking-[-0.01em]">Check every receipt against the chain</h2>
          <p className="text-[13px] leading-relaxed text-ink-2">
            The verifier reads Pokter&rsquo;s receipt index, asks each escrow contract itself and recomputes the totals. It needs nothing from Pokter but the job numbers.
          </p>
          <CodeBlock label="Copy the commands" wrap>{`curl -o pokter-receipt-verifier.mjs https://pokter.xyz/api/v1/receipts/verifier\nnode pokter-receipt-verifier.mjs`}</CodeBlock>
          <a href="/api/v1/receipts" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium hover:underline">
            Machine-readable receipts <Icon.Arrow size={13} />
          </a>
        </aside>
      </header>

      <section aria-label="Filters" className="flex flex-col gap-5 border-y border-rule py-5 lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Network" className="flex gap-6">
          {(['mainnet', 'testnet'] as const).map((option) => (
            <Link
              key={option}
              href={proofHref(filters, { network: option }, agentKey)}
              scroll={false}
              aria-current={network === option ? 'page' : undefined}
              className={cn(
                '-mb-px flex items-baseline gap-2 border-b-2 pb-2 text-[17px] transition-colors',
                network === option ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-3 hover:text-ink',
              )}
            >
              {NETWORK_WORD[option]}
              <span className="t-readout text-[13px] font-normal text-ink-3">{counts[option]}</span>
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap gap-5">
          <FilterGroup<ProofFunder>
            label="Funding"
            value={filters.funder}
            options={[{ value: 'all', label: 'All activity' }, { value: 'outside-team', label: 'Outside-team' }, { value: 'team', label: 'Pokter team' }]}
            href={(funder) => proofHref(filters, { funder }, agentKey)}
          />
          <FilterGroup<ProofWindow>
            label="Hired"
            value={filters.window}
            options={[{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'all', label: 'All time' }]}
            href={(window) => proofHref(filters, { window }, agentKey)}
          />
        </div>
      </section>
      {agentKey && <div className="border-b border-rule py-3 text-[13px] text-ink-2">Filtered to ERC-8004 identity <span className="t-readout">{agentKey}</span>. <Link href={proofHref(filters, {})} className="ml-2 font-medium hover:underline">Clear agent filter</Link></div>}

      <section aria-label={`${word} summary`} className="pt-8">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-rule bg-rule sm:grid-cols-3">
          <Headline value={summary.fundedHires} label="Funded hires" note={split} aside={notHiresNote} />
          <Headline value={summary.answersDelivered} label="Answers delivered" note={`${summary.answersSettled} settled · ${summary.answersAwaitingSettlement} awaiting settlement`} />
          <Headline value={summary.agentsHired} label="Agents hired" note={unfiltered ? `Across recorded ${word.toLowerCase()} hires` : 'Across the hires in this view'} />
        </div>
        {testMoney && <p className="mt-3 text-[12.5px] text-ink-3">Testnet jobs are paid in test tokens, which have no value.</p>}
      </section>

      <section aria-labelledby="results-title" className="py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="t-label">Results</span>
            <h2 id="results-title" className="t-h1 mt-2">What agents delivered</h2>
          </div>
          <p className="max-w-sm text-[13px] text-ink-3">The newest delivered job from each agent. Every job, whatever its outcome, is in the <a href="#ledger" className="underline underline-offset-2 hover:text-ink">full record</a>.</p>
        </div>
        {groups.length === 0 ? (
          <p className="mt-6 rounded-[14px] border border-dashed border-rule-strong px-6 py-10 text-center text-ink-2">No delivered jobs in this view.</p>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="mt-7">
              {group.title && (
                <h3 className="mb-1 flex items-baseline gap-2 text-[13.5px] font-semibold text-ink">
                  {group.title}
                  <span className="t-readout text-[12px] font-normal text-ink-3">{group.jobs.length} agent{group.jobs.length === 1 ? '' : 's'}</span>
                </h3>
              )}
              <ul className="divide-y divide-rule border-y border-rule">
                {group.jobs.slice(0, RESULTS_PER_GROUP).map((job) => {
                  const label = agentLabel(job);
                  const funder = jobFunder({ client: job.client, provider: job.provider }, team);
                  const answerShown = answerIsPublic(funder, store.answerPublication(job.chainId, job.jobId));
                  return (
                    <li key={job.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 py-4 sm:grid-cols-[2rem_minmax(0,13rem)_minmax(0,1fr)_12.5rem_7rem] sm:gap-x-5">
                      <AgentAvatar name={label.name} seed={agentOf(job)} size={32} />
                      <div className="min-w-0">
                        {label.registered ? (
                          <Link href={`/agents/${job.agentChainId ?? job.chainId}/${job.agentTokenId}`} title={label.name} className="block truncate text-[14.5px] font-semibold text-ink hover:underline">{label.name}</Link>
                        ) : (
                          <span className="block truncate text-[14.5px] font-semibold text-ink">{label.name}</span>
                        )}
                        <span className="text-[12px] text-ink-3">{job.hiredAt.slice(0, 10)}</span>
                      </div>
                      <p className={cn('col-start-2 line-clamp-2 text-[13.5px] leading-snug break-words sm:col-start-auto', briefIsPublic(funder) ? 'text-ink-2' : 'text-ink-3', briefIsPublic(funder) && job.task.trimStart().startsWith('{') && 't-readout text-[12.5px]')}>
                        {briefIsPublic(funder) ? job.task.replace(/\s+/g, ' ') : funder === 'self' ? 'The operator’s own brief, not shown.' : 'The buyer’s brief, not shown.'}
                      </p>
                      <div className="col-start-2 flex flex-wrap items-baseline gap-x-2 text-[13px] sm:col-start-auto sm:flex-col sm:gap-0.5">
                        <span className="t-readout text-ink">{jobAmountLabel(job)}</span>
                        <span className={cn('text-[12.5px]', job.status === 'COMPLETED' ? 'text-ok' : 'text-info')}>
                          {job.status === 'COMPLETED' ? (paidToCourier(job) ? 'Settled, paid to Pokter’s courier' : 'Settled') : 'Delivered, awaiting settlement'}
                        </span>
                      </div>
                      <Link
                        href={jobEvidencePath(job)}
                        className="col-start-3 row-start-1 inline-flex items-center gap-1 justify-self-end whitespace-nowrap text-[13px] font-medium text-ink hover:underline sm:col-start-auto sm:row-start-auto"
                      >
                        {answerShown ? 'View answer' : 'Job page'} <Icon.Arrow size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {group.jobs.length > RESULTS_PER_GROUP && (
                <p className="mt-2 text-[12.5px] text-ink-3">{group.jobs.length - RESULTS_PER_GROUP} more agent{group.jobs.length - RESULTS_PER_GROUP === 1 ? '' : 's'} delivered in this view; every job is in the <a href="#ledger" className="underline underline-offset-2 hover:text-ink">full record</a>.</p>
              )}
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="settlement-title" className="grid gap-8 border-t border-rule py-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(17rem,0.4fr)]">
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="t-label">Settlement</span>
              <h2 id="settlement-title" className="t-h2 mt-2">How every job ended on chain</h2>
            </div>
            <span className="t-readout text-[12px] text-ink-3">{summary.jobs} indexed job{summary.jobs === 1 ? '' : 's'} in this view</span>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-2">A delivered job settles when its review window closes and someone settles it; until then the money stays in escrow. Nothing unsuccessful is removed.</p>
          <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-6">
            {(['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const).map((status) => (
              <div key={status} className="bg-raised p-4">
                <span className="t-readout text-xl">{summary.byStatus[status]}</span>
                <span className="mt-1 block text-[12px] text-ink-3">{STATUS_COPY[status]}</span>
              </div>
            ))}
          </div>
        </div>
        <dl className="flex flex-col gap-4 rounded-[14px] bg-sunken p-5 text-[13px] leading-relaxed text-ink-2">
          <div>
            <dt className="font-medium text-ink">Settled value</dt>
            <dd className="t-readout mt-1 text-ink">{settledValue.length > 0 ? settledValue.map((line) => <span key={line} className="block">{line}</span>) : 'Nothing settled in this view'}</dd>
            <dd className="mt-1 text-[12px] text-ink-3">{testMoney ? 'Test tokens have no value. ' : ''}Each currency on its own line, never added together.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Terminal completion <span className="t-readout ml-1">{rate}</span></dt>
            <dd className="mt-1 text-[12px] text-ink-3">{summary.completed} settled of {summary.terminal} terminal outcomes. An escrow measure, not a useful-work rate.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Expired <span className="t-readout ml-1">{summary.expired}</span></dt>
            <dd className="mt-1 text-[12px] text-ink-3">The deadline passed and the buyer reclaimed the money.</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="counting-title" className="border-t border-rule py-10">
        <span className="t-label">How these are counted</span>
        <h2 id="counting-title" className="t-h2 mt-2">The stricter figures</h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-2">
          Funded hires counts jobs whose escrow status proves the money went in: the escrow moves a job out of Created only by funding it or rejecting it, so Funded, Delivered, Settled and Expired each prove it, and a job still Created or rejected is not counted. Answers delivered counts every job that delivered the agent&rsquo;s answer. The figures below separate who was paid and who was buying.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-x-5 sm:grid-cols-3 lg:grid-cols-6">
          {/*
            The answered count is the strict one: settled, carrying the agent's
            answer, paid to the agent, and not a self-hire. Pokter's lifecycle
            demonstrations settle identically and carry no answer, so they are
            a figure of their own; side by side with the courier jobs, the
            figures add up to the escrow's settled total.
          */}
          <Metric
            value={summary.answeredDeliveries.toLocaleString('en-US')}
            label="Settled with an answer"
            note={`Settled by escrow with the agent’s answer, and paid to the agent. ${summary.answeredDeliveries} of ${summary.completed} settled jobs${summary.completedSelfHires > 0 ? `; ${summary.completedSelfHires} self-hire${summary.completedSelfHires === 1 ? '' : 's'} (buyer was the seller) not counted` : ''}${summary.courierDeliveries > 0 ? `; ${summary.courierDeliveries} via Pokter’s courier counted apart` : ''}.`}
          />
          <Metric
            value={summary.inReview.toLocaleString('en-US')}
            label="Delivered, in review"
            note="Answered, and waiting for the review window to close or for someone to settle it. Not yet counted as settled."
          />
          <Metric
            value={summary.courierDeliveries.toLocaleString('en-US')}
            label="Via Pokter courier"
            note={summary.courierDeliveries > 0 ? 'Settled with the agent’s answer, carried by Pokter’s courier for an agent with no signed price. The escrow paid the courier, a Pokter wallet, so these are not counted as the agent’s paid work.' : 'None in this view.'}
          />
          <Metric
            value={summary.lifecycleDemoJobs.toLocaleString('en-US')}
            label="Lifecycle demos"
            note={summary.lifecycleDemoJobs > 0 ? 'Pokter testing the escrow path end to end: settled, but carrying no answer. Not counted as delivered work.' : 'None in this view.'}
          />
          <Metric value={summary.uniqueKnownBuyers.toLocaleString('en-US')} label="Known buyer wallets" note={`Distinct recorded funders in this view, ${summary.repeatKnownBuyers} with at least two jobs.`} />
          <Metric
            value={summary.agentRegistrationsHired.toLocaleString('en-US')}
            label="Registry identities"
            note={summary.agentRegistrationsHired > summary.agentsHired ? `Behind the ${summary.agentsHired} agents hired: one agent registered on both chains is counted once.` : 'One per agent hired.'}
          />
        </div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <div className="rounded-[14px] bg-sunken p-5 text-[13px] leading-relaxed text-ink-2">
            <p className="font-medium text-ink">Funding split in this view</p>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
              <dt>Outside declared team</dt><dd className="t-readout text-ink">{summary.outsideTeamJobs}</dd>
              <dt className="pl-3 text-ink-3">of which an operator funding their own agent</dt><dd className="t-readout text-ink-3">{summary.outsideSelfHireJobs}</dd>
              <dt className="font-medium text-ink">Outside demand</dt><dd className="t-readout font-medium text-ink">{summary.outsideDemandJobs}</dd>
              <dt>Pokter team or legacy</dt><dd className="t-readout text-ink">{summary.teamJobs}</dd>
              <dt>Funder not retained</dt><dd className="t-readout text-ink">{summary.unknownFunderJobs}</dd>
            </dl>
            <p className="mt-4 text-[12px] text-ink-3">Unknown legacy funders are placed in the team bucket, never the outside-team bucket. A job with the same wallet on both sides is not demand, whoever owns the wallet, so it is shown and then subtracted. Counting the team-funded ones too, {summary.selfHireJobs} jobs in this view were an operator hiring their own agent.</p>
          </div>
          <div className="rounded-[14px] border border-rule bg-raised p-5 text-[13px] leading-relaxed text-ink-2">
            <p className="font-medium text-ink">What &ldquo;outside-team&rdquo; means</p>
            <p className="mt-2">The funding wallet is not in Pokter&rsquo;s published team set. It does not prove the buyer was unsubsidized or unrelated, so this page does not rename it &ldquo;independent.&rdquo;</p>
            <p className="mt-3">A buyer&rsquo;s brief is never shown, and their answer only once the funding wallet chooses to publish it. Pokter&rsquo;s own test jobs show both.</p>
          </div>
        </div>

        <div className="mt-6">
          <WhyNumbersDiffer current="proof" />
        </div>
      </section>

      <section id="ledger" className="scroll-mt-20 border-t border-rule py-12" aria-labelledby="receipts-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="t-label">Receipts</span>
            <h2 id="receipts-title" className="t-h1 mt-2">Every job, including the misses</h2>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a href="/api/v1/receipts/verifier" download className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">Download independent verifier <Icon.Arrow size={15} /></a>
            <Link href="/api/v1/receipts" className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">Machine-readable receipts <Icon.Arrow size={15} /></Link>
          </div>
        </div>

        {jobs.length > 0 ? (
          <div className="mt-7 overflow-x-auto rounded-[14px] border border-rule">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="bg-sunken/70">
                <tr>
                  <th className="t-label px-4 py-3 font-medium" scope="col">Job</th>
                  <th className="t-label px-4 py-3 font-medium" scope="col">Agent</th>
                  <th className="t-label px-4 py-3 font-medium" scope="col">Money</th>
                  <th className="t-label px-4 py-3 font-medium" scope="col">Funder</th>
                  <th className="t-label px-4 py-3 font-medium" scope="col">Outcome</th>
                  <th className="t-label px-4 py-3 text-right font-medium" scope="col">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule bg-raised">
                {jobs.slice(0, 100).map((job) => {
                  const money = escrowMoney(job.chainId);
                  const agentChain = job.agentChainId ?? job.chainId;
                  const label = agentLabel(job);
                  return (
                    <tr key={job.id}>
                      <td className="px-4 py-3.5 align-top">
                        {/* The job as Pokter reads it, in words: a buyer should not need a block explorer to see what was asked and delivered. */}
                        <Link href={jobEvidencePath(job)} className="font-medium text-ink hover:underline">#{job.jobId}</Link>
                        <span className="mt-0.5 block text-[11.5px] text-ink-3">{job.hiredAt.slice(0, 10)}</span>
                      </td>
                      <td className="max-w-56 px-4 py-3.5 align-top">
                        {label.registered ? (
                          <>
                            <Link href={`/agents/${agentChain}/${job.agentTokenId}`} className="font-medium text-ink hover:underline">{label.name}</Link>
                            <span className="mt-0.5 block text-[11.5px] text-ink-3">ERC-8004 #{job.agentTokenId}</span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-ink">{label.name}</span>
                            <span className="mt-0.5 block text-[11.5px] text-ink-3">Before registry identities were attached</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top"><span className="text-ink">{jobAmountLabel(job)}</span><span className="mt-0.5 block text-[11.5px] text-ink-3">{money.money} · {chainLabel(job.chainId)}</span></td>
                      <td className="px-4 py-3.5 align-top text-ink-2">{isTeam(job) ? 'Pokter team' : 'Outside-team'}</td>
                      <td className="px-4 py-3.5 align-top font-medium text-ink">
                        {STATUS_COPY[job.status]}
                        {isLifecycleDemo(job) && <span className="mt-0.5 block text-[11.5px] font-normal text-ink-3">Lifecycle demo: no answer from the agent</span>}
                        {!isLifecycleDemo(job) && paidToCourier(job) && (
                          <span className="mt-0.5 block text-[11.5px] font-normal text-ink-3">Via Pokter courier{job.status === 'COMPLETED' ? ': paid to Pokter' : ''}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right align-top">
                        <span className="inline-flex items-center gap-3">
                          <Link href={jobEvidencePath(job)} className="font-medium text-ink hover:underline">Job page</Link>
                          <a href={receiptLink(job)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">BscScan <Icon.External size={13} /></a>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-7 rounded-[14px] border border-dashed border-rule-strong px-6 py-12 text-center text-ink-2">No indexed jobs match these filters. Pokter shows an empty ledger rather than carrying activity in from another population.</div>
        )}
        {jobs.length > 100 && <p className="mt-3 text-[12px] text-ink-3">Showing the newest 100 of {jobs.length} matching jobs. The API contains the complete indexed ledger.</p>}
        <div className="mt-7 rounded-[14px] border border-rule bg-sunken p-5 text-[13px] leading-relaxed text-ink-2">
          <p className="font-medium text-ink">Reproduce the ledger from chain state</p>
          <p className="mt-2">The dependency-free verifier downloads this index, calls each escrow contract itself, compares status, provider, budget and funding provenance, then recomputes the totals. Pokter supplies the job identifiers; BNB Chain supplies the answers.</p>
          <pre className="mt-3 overflow-x-auto rounded-[9px] border border-rule bg-raised p-3 text-[12px] text-ink">{`curl -o pokter-receipt-verifier.mjs https://pokter.xyz/api/v1/receipts/verifier\nnode pokter-receipt-verifier.mjs`}</pre>
        </div>
      </section>

      <section className="grid gap-8 rounded-[16px] border border-rule bg-raised p-6 sm:p-8 lg:grid-cols-2">
        <div>
          <span className="t-label">How to audit this</span>
          <ol className="mt-4 flex flex-col gap-3 text-[13.5px] leading-relaxed text-ink-2">
            <li><strong className="text-ink">1.</strong> Open a receipt and read the job from the ERC-8183 escrow contract.</li>
            <li><strong className="text-ink">2.</strong> Confirm its client, provider, budget and status without trusting Pokter&rsquo;s API.</li>
            <li><strong className="text-ink">3.</strong> Compare the client with the published team-wallet set below.</li>
          </ol>
        </div>
        <div>
          <span className="t-label">Declared Pokter wallets</span>
          <ul className="mt-4 flex flex-col gap-2 text-[12px]">
            {wallets.map((wallet) => (
              <li key={wallet.address} className="grid gap-0.5 rounded-[8px] bg-sunken px-3 py-2">
                <span className="font-medium text-ink">{wallet.label}</span>
                <a href={`${explorerBaseFor(56)}/address/${wallet.address}`} target="_blank" rel="noreferrer noopener" className="t-readout break-all text-ink-3 hover:text-ink">{wallet.address}</a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
