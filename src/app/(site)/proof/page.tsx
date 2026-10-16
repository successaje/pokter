import type { Metadata } from 'next';
import Link from 'next/link';
import { formatUnits } from 'viem';

import {
  filterCurrentProductionJobs,
  summarizeProductionProof,
  type ProductionProofFilters,
  type ProofFunder,
  type ProofNetwork,
  type ProofWindow,
} from '@/lib/erc8183/production-proof';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { getJobStore } from '@/lib/erc8183/store';
import { isLifecycleDemo } from '@/lib/agent/credited-history';
import { listSearchable } from '@/lib/marketplace';
import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';
import { chainLabel, escrowMoney, explorerBaseFor } from '@/lib/network/presentation';
import { teamWalletList, teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Production proof',
  description: 'Every job Pokter has indexed, split by network, funding provenance and on-chain outcome, with receipts anyone can verify.',
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

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(raw: Record<string, string | string[] | undefined>): ProductionProofFilters {
  const network = one(raw.network);
  const funder = one(raw.funder);
  const window = one(raw.window);
  return {
    network: network === 'mainnet' || network === 'testnet' ? network : 'all',
    /*
     * Outside-team by default: the question a visitor brings is whether
     * agents hired here deliver for buyers, and the team's test hires answer
     * a different one. Both stay one click away and are never hidden.
     */
    funder: funder === 'team' || funder === 'all' ? funder : 'outside-team',
    window: window === '7d' || window === '30d' ? window : 'all',
  };
}

function proofHref(filters: ProductionProofFilters, change: Partial<ProductionProofFilters>, agent: string | null = null): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.network !== 'all') params.set('network', next.network);
  if (next.funder !== 'outside-team') params.set('funder', next.funder);
  if (next.window !== 'all') params.set('window', next.window);
  if (agent) params.set('agent', agent);
  const query = params.toString();
  return query ? `/proof?${query}` : '/proof';
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

function Metric({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="flex min-h-36 flex-col justify-between gap-5 border-t border-rule py-5 sm:px-5 sm:first:pl-0">
      <span className="t-readout text-[2rem] leading-none tracking-[-0.04em]">{value}</span>
      <span>
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        <span className="mt-1 block text-[12px] leading-relaxed text-ink-3">{note}</span>
      </span>
    </div>
  );
}

function receiptLink(job: HiredJob): string {
  if (job.hireTxHash) return `${explorerBaseFor(job.chainId)}/tx/${job.hireTxHash}`;
  return `${explorerBaseFor(job.chainId)}/address/${correctedErc8183Addresses(job.chainId).commerce}#readContract`;
}

export default async function ProductionProofPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const agent = one(raw.agent);
  const agentKey = agent && /^\d+\:\d+$/.test(agent) ? agent : null;
  const team = teamWalletSet();
  const isTeam = (job: HiredJob) => fundedByTeam(job, team);
  const jobs = filterCurrentProductionJobs(getJobStore().all(), filters, isTeam)
    .filter((job) => !agentKey || `${job.agentChainId ?? job.chainId}:${job.agentTokenId}` === agentKey)
    .sort((a, b) => b.hiredAt.localeCompare(a.hiredAt));
  const summary = summarizeProductionProof(jobs, isTeam, isLifecycleDemo);
  /*
   * These two are read for their settled value, which counts a demo's money
   * like any other because the escrow really did move it. They are given the
   * demo test anyway: an un-wired summary reports every accepted job as
   * answered, and a later reader of `answeredDeliveries` would get that
   * silently rather than as an error.
   */
  const mainnetSummary = summarizeProductionProof(jobs.filter((job) => job.chainId === 56), isTeam, isLifecycleDemo);
  const testnetSummary = summarizeProductionProof(jobs.filter((job) => job.chainId === 97), isTeam, isLifecycleDemo);
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
    const registry = names.get(`${job.agentChainId ?? job.chainId}:${job.agentTokenId}`);
    if (registry) return { name: registry, registered: true };
    const recorded = job.agentName && !/^verified testnet seller$/i.test(job.agentName) ? job.agentName : null;
    return { name: recorded ?? `Agent #${job.agentTokenId}`, registered: true };
  };
  const rate = summary.completionRate === null ? '—' : `${Math.round(summary.completionRate * 100)}%`;
  const mainnetValue = formatUnits(BigInt(mainnetSummary.completedValueRaw), 18);
  const testnetValue = formatUnits(BigInt(testnetSummary.completedValueRaw), 18);
  const valueMetric = filters.network === 'testnet'
    ? { value: testnetValue, label: 'Settled test value', note: 'Test $U has no real value.' }
    : filters.network === 'mainnet'
      ? { value: mainnetValue, label: 'Settled value ($U)', note: 'Real $U settled on BNB Chain.' }
      : { value: mainnetValue, label: 'Mainnet settled ($U)', note: `${testnetValue} test $U shown separately.` };

  return (
    <div className="frame pb-24 pt-10 sm:pt-16">
      <header className="grid gap-8 border-b border-rule pb-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-end">
        <div className="flex max-w-3xl flex-col gap-4">
          <span className="t-label flex items-center gap-2"><span className="tile" aria-hidden /> Production proof</span>
          <h1 className="t-display">The jobs, including the misses.</h1>
          <p className="t-lede max-w-2xl">
            Every escrow job Pokter has indexed, separated by real and test money, team and outside-team funding, and its latest on-chain outcome. The receipt—not this page—is the source of truth.
          </p>
        </div>
        <div className="rounded-[14px] border border-rule bg-raised p-5 text-[13px] leading-relaxed text-ink-2">
          <p className="font-medium text-ink">What “outside-team” means</p>
          <p className="mt-2">The funding wallet is not in Pokter&rsquo;s published team set. It does not prove the buyer was unsubsidized or unrelated, so this page does not rename it “independent.”</p>
        </div>
      </header>

      <section aria-label="Filters" className="grid gap-5 border-b border-rule py-6 md:grid-cols-3">
        <FilterGroup<ProofNetwork>
          label="Money network"
          value={filters.network}
          options={[{ value: 'all', label: 'Both' }, { value: 'mainnet', label: 'Mainnet' }, { value: 'testnet', label: 'Testnet' }]}
          href={(network) => proofHref(filters, { network }, agentKey)}
        />
        <FilterGroup<ProofFunder>
          label="Funding provenance"
          value={filters.funder}
          options={[{ value: 'outside-team', label: 'Outside-team' }, { value: 'all', label: 'All' }, { value: 'team', label: 'Pokter team' }]}
          href={(funder) => proofHref(filters, { funder }, agentKey)}
        />
        <FilterGroup<ProofWindow>
          label="Hire window"
          value={filters.window}
          options={[{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'all', label: 'All time' }]}
          href={(window) => proofHref(filters, { window }, agentKey)}
        />
      </section>
      {agentKey && <div className="border-b border-rule py-3 text-[13px] text-ink-2">Filtered to ERC-8004 identity <span className="t-readout">{agentKey}</span>. <Link href={proofHref(filters, {})} className="ml-2 font-medium hover:underline">Clear agent filter</Link></div>}

      <section aria-label="Production metrics" className="grid grid-cols-2 gap-x-5 py-8 sm:grid-cols-4 lg:grid-cols-7">
        {/*
          The answered count leads, because "Accepted deliveries" counted
          Pokter's own lifecycle demonstrations — which settle identically
          and carry no answer — and the rows below already said so one by
          one. The accepted total stays in the note: it is a true escrow
          fact, and the two figures have to add up for a reader checking
          them against the outcome bars.
        */}
        {/*
          And the demos get a tile of their own. Kept in a note, the split
          was there for anyone who read it and invisible to anyone who
          scanned: an outside review read the page as 12 accepted with a
          footnote, when the figure that means something is the 7 answered.
          Side by side, the two add up to the escrow's accepted total.
        */}
        <Metric
          value={summary.answeredDeliveries.toLocaleString('en-US')}
          label="Answered deliveries"
          note={`Settled by escrow with the agent’s answer. ${summary.answeredDeliveries} of ${summary.completed} settled jobs${summary.completedSelfHires > 0 ? `; ${summary.completedSelfHires} self-hire${summary.completedSelfHires === 1 ? '' : 's'} (buyer was the seller) not counted` : ''}.`}
        />
        <Metric
          value={summary.lifecycleDemoJobs.toLocaleString('en-US')}
          label="Lifecycle demos"
          note={summary.lifecycleDemoJobs > 0 ? 'Pokter testing the escrow path end to end: settled, but carrying no answer. Not counted as delivered work.' : 'None in this view.'}
        />
        <Metric value={rate} label="Terminal completion" note={`${summary.completed} settled of ${summary.terminal} terminal outcomes. An escrow measure, not a useful-work rate.`} />
        <Metric value={summary.uniqueKnownBuyers.toLocaleString('en-US')} label="Known buyer wallets" note="Distinct recorded funders in this view." />
        <Metric value={summary.agentsHired.toLocaleString('en-US')} label="Agents hired" note="Distinct registry identities commissioned." />
        <Metric value={summary.repeatKnownBuyers.toLocaleString('en-US')} label="Repeat buyers" note="Known wallets with at least two jobs." />
        <Metric {...valueMetric} />
      </section>

      <section className="grid gap-8 border-y border-rule py-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(17rem,0.4fr)]">
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="t-label">On-chain outcomes</span>
              <h2 className="t-h2 mt-2">Nothing unsuccessful is removed</h2>
            </div>
            <span className="t-readout text-[12px] text-ink-3">{summary.jobs} indexed job{summary.jobs === 1 ? '' : 's'} in this view</span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-6">
            {(['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const).map((status) => (
              <div key={status} className="bg-raised p-4">
                <span className="t-readout text-xl">{summary.byStatus[status]}</span>
                <span className="mt-1 block text-[12px] text-ink-3">{STATUS_COPY[status]}</span>
              </div>
            ))}
          </div>
        </div>
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
      </section>

      <section className="py-12" aria-labelledby="receipts-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="t-label">Receipts</span>
            <h2 id="receipts-title" className="t-h1 mt-2">Verify every row yourself</h2>
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
                      <td className="px-4 py-3.5 align-top"><span className="font-medium text-ink">#{job.jobId}</span><span className="mt-0.5 block text-[11.5px] text-ink-3">{job.hiredAt.slice(0, 10)}</span></td>
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
                      <td className="px-4 py-3.5 align-top"><span className="text-ink">{formatUnits(BigInt(job.budgetRaw), 18)} $U</span><span className="mt-0.5 block text-[11.5px] text-ink-3">{money.money} · {chainLabel(job.chainId)}</span></td>
                      <td className="px-4 py-3.5 align-top text-ink-2">{isTeam(job) ? 'Pokter team' : 'Outside-team'}</td>
                      <td className="px-4 py-3.5 align-top font-medium text-ink">
                        {STATUS_COPY[job.status]}
                        {isLifecycleDemo(job) && <span className="mt-0.5 block text-[11.5px] font-normal text-ink-3">Lifecycle demo: no answer from the agent</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right align-top"><a href={receiptLink(job)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-ink hover:underline">BscScan <Icon.External size={13} /></a></td>
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
