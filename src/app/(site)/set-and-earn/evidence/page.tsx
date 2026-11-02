import type { Metadata } from 'next';
import Link from 'next/link';
import { getAddress, isAddress } from 'viem';

import { campaignEvidence, type CampaignEvidence } from '@/lib/campaign/evidence';
import { campaignProgress } from '@/lib/campaign/progress-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Campaign evidence',
  description: 'Public escrow and registry references for one Set and Earn wallet, with what Pokter cannot verify stated alongside them.',
  robots: { index: false, follow: false },
};

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' : 'time unavailable';

function Count({ value, label }: { value: number | string; label: string }) {
  return <div className="rounded-[12px] border border-rule bg-raised p-4"><strong className="block text-[24px] font-medium">{value}</strong><span className="text-[12.5px] text-ink-3">{label}</span></div>;
}

export default async function CampaignEvidencePage({ searchParams }: { searchParams: Promise<{ address?: string | string[] }> }) {
  const query = (await searchParams).address;
  const raw = typeof query === 'string' ? query : '';
  const address = isAddress(raw) ? getAddress(raw) : null;
  let evidence: CampaignEvidence | null = null;
  let failed = false;
  if (address) {
    try {
      evidence = campaignEvidence(await campaignProgress(address, { includeEvidence: true }));
    } catch (error) {
      console.error('[campaign/evidence/page]', error);
      failed = true;
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-[1080px] px-5 pb-20 pt-10 sm:px-8">
      <Link href="/set-and-earn" className="text-[13px] text-ink-3 hover:text-ink">← Set and Earn</Link>
      <div className="mt-5 max-w-[720px]">
        <p className="t-label text-ink-3">BNB CHAIN · PUBLIC RECORD</p>
        <h1 className="t-h1 mt-2">Campaign evidence for a wallet</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">A shareable reading of the escrow jobs and agent registrations Pokter can see. Each job has its chain, contract and ID so anyone can check the onchain record again. BNB Chain makes the qualification decision.</p>
      </div>

      <form action="/set-and-earn/evidence" method="get" className="mt-7 flex max-w-[720px] flex-wrap gap-2">
        <label htmlFor="evidence-address" className="sr-only">Wallet address</label>
        <input id="evidence-address" name="address" defaultValue={raw} placeholder="0x… wallet address" spellCheck={false} className="min-w-0 flex-1 rounded-[9px] border border-rule-strong bg-paper px-3 py-2.5 font-mono text-[13px] text-ink outline-none focus:border-ink" />
        <button type="submit" className="rounded-[9px] bg-ink px-4 py-2.5 text-[13px] font-medium text-paper">View evidence</button>
      </form>
      {raw && !address && <p role="alert" className="mt-2 text-[13px] text-bad">Enter a valid EVM wallet address.</p>}
      {failed && <p role="alert" className="mt-5 text-[14px] text-bad">The public records could not be read just now. Try again shortly.</p>}

      {evidence && (
        <div className="mt-8 flex flex-col gap-9">
          {evidence.indexStatus !== 'recent' && <p role="status" className="rounded-[10px] border border-watch bg-watch-wash p-4 text-[13px] leading-relaxed text-ink">{evidence.indexStatus === 'stale' ? 'Pokter’s escrow index is older than six hours.' : 'Indexer freshness could not be confirmed.'} Newer hires may be missing, so the counts below are a partial record. See the coverage timestamps at the end.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-rule py-4 text-[13px] text-ink-2">
            <span><span className="text-ink-3">Wallet</span> <span className="break-all font-mono text-ink">{evidence.wallet}</span><br /><span className="text-ink-3">Read {date(evidence.observedAt)}</span></span>
            <a href={`/api/campaign/evidence?address=${evidence.wallet}`} className="rounded-[9px] border border-rule-strong px-4 py-2.5 font-medium text-ink hover:border-ink">Download evidence JSON</a>
          </div>

          <section aria-labelledby="evidence-hires" className="flex flex-col gap-4">
            <div><h2 id="evidence-hires" className="text-[22px] font-medium">Hires across indexed escrow contracts</h2><p className="mt-1 text-[13px] text-ink-3">Funding counts as a hire. Marketplace names come from job records or Pokter’s own index.</p></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Count value={evidence.hires.totalFunded} label="indexed funded jobs" />
              <Count value={evidence.hires.distinctAgents} label="different agents or paid wallets" />
              <Count value={evidence.hires.namedMarketplaces.length} label="named marketplaces" />
              <Count value={evidence.hires.unattributed} label="marketplace not recorded" />
            </div>
            <p className="text-[13px] text-ink-2">Marketplace evidence: {evidence.hires.marketplacesStatus === 'met' ? 'Two or more named in job records.' : evidence.hires.marketplacesStatus === 'likely' ? 'A second marketplace is possible, but the records do not name it.' : 'Two marketplaces are not shown.'}</p>
            {evidence.hires.jobs.length ? <ol className="divide-y divide-rule rounded-[12px] border border-rule bg-raised px-4">
              {evidence.hires.jobs.map((job) => <li key={`${job.chainId}:${job.jobId}`} className="flex flex-wrap items-start justify-between gap-3 py-3 text-[13px]">
                <div><strong className="font-medium">Job #{job.jobId}</strong> <span className="text-ink-3">· chain {job.chainId} · {job.status}</span><p className="mt-1 text-ink-2">{job.agent?.name ?? short(job.provider)} · {job.marketplace ?? 'Marketplace not recorded'}</p></div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-ink-2"><a href={job.contractReadUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">Read contract</a>{job.hireTransactionUrl && <a href={job.hireTransactionUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">Hire tx</a>}{job.settlementTransactionUrl && <a href={job.settlementTransactionUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">Settle tx</a>}</div>
              </li>)}
            </ol> : <p className="rounded-[12px] border border-rule bg-raised p-4 text-[13px] text-ink-3">No funded hires were found for this wallet through the indexer’s last recorded job. Newer jobs may be missing.</p>}
          </section>

          <section aria-labelledby="evidence-build" className="flex flex-col gap-3">
            <div><h2 id="evidence-build" className="text-[22px] font-medium">Agents registered to this wallet</h2><p className="mt-1 text-[13px] text-ink-3">The registry timestamp is compared with the campaign window. Pokter cannot see BNB Chain’s registration form.</p></div>
            {evidence.registeredAgents === null ? <p className="rounded-[12px] border border-rule bg-raised p-4 text-[13px] text-watch">The registry did not answer, so ownership could not be checked.</p> : evidence.registeredAgents.length ? <ol className="divide-y divide-rule rounded-[12px] border border-rule bg-raised px-4">{evidence.registeredAgents.map((agent) => <li key={`${agent.chainId}:${agent.tokenId}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[13px]"><span><strong className="font-medium">{agent.name}</strong> <span className="text-ink-3">· {agent.chainId}/{agent.tokenId}</span><br /><span className="text-ink-3">Registered {date(agent.registeredAt)} · {agent.inWindow === true ? 'inside campaign window' : agent.inWindow === false ? 'before campaign window' : 'time unavailable'}</span></span><span className="flex gap-3"><Link href={agent.profileUrl} className="underline underline-offset-2">Agent profile</Link>{agent.registryReadUrl && <a href={agent.registryReadUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">Registry</a>}</span></li>)}</ol> : <p className="rounded-[12px] border border-rule bg-raised p-4 text-[13px] text-ink-3">No owned agent was returned by the registry.</p>}
          </section>

          <section aria-labelledby="evidence-adoption" className="flex flex-col gap-3">
            <div><h2 id="evidence-adoption" className="text-[22px] font-medium">Hires and submissions of the newest campaign agent</h2><p className="mt-1 text-[13px] text-ink-3">Completed jobs and submission times read from escrow. Outside-owner wallets are counted by address; Pokter cannot verify who funded them or whether every provider is the agent’s registered wallet.</p></div>
            {evidence.adoption ? <div className="flex flex-col gap-4 rounded-[12px] border border-rule bg-raised p-4">
              <p className="text-[13px]"><strong>{evidence.adoption.agent.name}</strong> <span className="text-ink-3">· {evidence.adoption.agent.chainId}/{evidence.adoption.agent.tokenId}</span></p>
              <div className="grid grid-cols-3 gap-2"><Count value={evidence.adoption.outsideOwnerWallets} label="wallets outside owner" /><Count value={evidence.adoption.countedSubmissions} label="counted submissions" /><Count value={evidence.adoption.activeUtcDays} label="UTC days with submissions" /></div>
              {evidence.adoption.actionsBlockedReason && <p className="text-[13px] text-watch">{evidence.adoption.actionsBlockedReason}</p>}
              {evidence.adoption.unreadJobs > 0 && <p className="text-[13px] text-watch">{evidence.adoption.unreadJobs} job reads failed; the totals may be low.</p>}
              <div className="flex flex-col gap-2 border-t border-rule pt-3 text-[13px]">
                <details className="group"><summary className="cursor-pointer font-medium">Completed jobs ({evidence.adoption.completedHires.length})</summary><ol className="mt-2 divide-y divide-rule">{evidence.adoption.completedHires.map((job) => <li key={`${job.chainId}:${job.jobId}`} className="flex flex-wrap justify-between gap-2 py-2"><span>Job #{job.jobId} · chain {job.chainId} · buyer {short(job.client)}</span>{job.reference && <a href={job.reference.contractReadUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">Read contract</a>}</li>)}</ol></details>
                <details className="group"><summary className="cursor-pointer font-medium">Counted submissions ({evidence.adoption.submissions.length})</summary><ol className="mt-2 divide-y divide-rule">{evidence.adoption.submissions.map((action) => <li key={`${action.chainId}:${action.jobId}`} className="flex flex-wrap justify-between gap-2 py-2"><span>Job #{action.jobId} · {date(action.submittedAt)}</span>{action.reference && <a href={action.reference.contractReadUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">Read contract</a>}</li>)}</ol></details>
              </div>
            </div> : <p className="rounded-[12px] border border-rule bg-raised p-4 text-[13px] text-ink-3">{evidence.registeredAgents?.some((agent) => agent.inWindow) ? 'Adoption could not be read just now.' : 'No agent registered in the campaign window was found for this wallet.'}</p>}
          </section>

          <section aria-labelledby="evidence-limits" className="border-t border-rule pt-6">
            <h2 id="evidence-limits" className="text-[18px] font-medium">What this record cannot establish</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-2">{evidence.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
            <p className="mt-4 text-[12.5px] text-ink-3">Indexer coverage: {evidence.indexCoverage.map((row) => `chain ${row.chainId} through job #${row.throughJob}${row.updatedAt ? `, updated ${date(row.updatedAt)}` : ', not yet updated'}`).join(' · ')}.</p>
          </section>
        </div>
      )}
    </main>
  );
}
