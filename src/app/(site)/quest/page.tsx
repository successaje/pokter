import type { Metadata } from 'next';
import Link from 'next/link';
import { isAddress } from 'viem';

import { CAMPAIGN_END_LABEL, CAMPAIGN_RULES_URL } from '@/lib/campaign/window';
import { chainLabel } from '@/lib/network/presentation';
import { lookupQuest, type QuestLookup } from '@/lib/quest/lookup';
import { POKTER_MARKETPLACE } from '@/lib/quest/progress';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Set and Earn tracker',
  description: 'Your Set and Earn hires across marketplaces, read from BNB Chain’s ERC-8183 escrow contracts. Paste a wallet address; no connection needed.',
  alternates: { canonical: '/quest' },
};

const STATUS_LABEL: Record<string, string> = {
  FUNDED: 'Funded',
  SUBMITTED: 'Delivered',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

const placeName = (m: string) => (m === POKTER_MARKETPLACE ? 'Pokter' : m);

function Check({ done, title, children }: { done: boolean | 'maybe'; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] border border-rule bg-raised p-5">
      <span
        className={cn(
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full',
          done === true ? 'bg-ok text-paper' : done === 'maybe' ? 'bg-watch-wash text-ink' : 'border border-rule-strong text-ink-3',
        )}
        aria-hidden
      >
        {done === true ? <Icon.Check size={13} /> : <Icon.Dash size={12} />}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{title}</p>
        <div className="text-[13.5px] leading-relaxed text-ink-2">{children}</div>
      </div>
    </div>
  );
}

function Result({ data }: { data: QuestLookup }) {
  const { summary, hires } = data;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Check done={summary.agentsMet} title={`${Math.min(summary.distinctAgents, 3)} of 3 different agents hired`}>
          {summary.hires === 0
            ? 'No funded hire from this wallet on either network since the campaign opened.'
            : `${summary.hires} funded hire${summary.hires === 1 ? '' : 's'}, ${summary.distinctAgents} different agent${summary.distinctAgents === 1 ? '' : 's'}.`}
        </Check>
        <Check done={summary.marketplaces === 'met' ? true : summary.marketplaces === 'likely' ? 'maybe' : false} title="At least two marketplaces">
          {summary.marketplaces === 'met' && `The records name ${summary.namedMarketplaces.map(placeName).join(' and ')}.`}
          {summary.marketplaces === 'likely' &&
            `The records name ${placeName(summary.namedMarketplaces[0])}; ${summary.unattributed} other hire${summary.unattributed === 1 ? '' : 's'} do not say where they were made, so a second marketplace is possible but not shown.`}
          {summary.marketplaces === 'not-met' &&
            (summary.namedMarketplaces.length === 1 && summary.unattributed === 0
              ? `Every hire so far was made on ${placeName(summary.namedMarketplaces[0])}. Hire on a second shortlisted marketplace.`
              : 'Not shown yet by the records.')}
        </Check>
      </div>

      {hires.length > 0 && (
        <div className="overflow-x-auto rounded-[14px] border border-rule">
          <table className="w-full min-w-[560px] text-left text-[13.5px]">
            <thead className="bg-sunken/60 text-[11.5px] uppercase tracking-wide text-ink-3">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Agent</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Network · job</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Marketplace, per the record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {hires.slice(0, 25).map((h) => (
                <tr key={`${h.chainId}:${h.jobId}`}>
                  <td className="px-4 py-3">
                    {h.agent ? (
                      <Link href={`/agents/${h.agent.chainId}/${h.agent.tokenId}`} className="link font-medium">
                        {h.agent.name ?? `Agent #${h.agent.tokenId}`}
                      </Link>
                    ) : (
                      <span className="text-ink-2">
                        Wallet <span className="t-readout">{shortAddress(h.provider)}</span>
                        <span className="block text-[12px] text-ink-3">Not matched to a listed agent</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {chainLabel(h.chainId)} · <span className="t-readout">#{h.jobId}</span>
                  </td>
                  <td className="px-4 py-3">{STATUS_LABEL[h.status] ?? h.status}</td>
                  <td className="px-4 py-3">{h.marketplace === POKTER_MARKETPLACE ? 'Pokter' : (h.marketplace ?? <span className="text-ink-3">Not recorded</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hires.length > 25 && <p className="border-t border-rule px-4 py-2.5 text-[12.5px] text-ink-3">And {hires.length - 25} more hires from this wallet.</p>}
        </div>
      )}

      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Read from BNB Chain&rsquo;s ERC-8183 escrow contracts on mainnet and testnet. Hires settled through a marketplace&rsquo;s own contract are not included. A hire counts once its escrow is funded. The contract records a job&rsquo;s deadline, not when it was made, so jobs with a deadline after 1 October are shown. Indexed through job{' '}
        {data.coverage.map((c, i) => (
          <span key={c.chainId}>
            {i > 0 ? ' and ' : ''}#{c.throughJob} on {chainLabel(c.chainId)}
          </span>
        ))}
        ; newer hires appear within about two hours. Registration with BNB Chain is not visible here, and BNB Chain alone decides eligibility from its own data.
      </p>
    </div>
  );
}

export default async function QuestPage({ searchParams }: { searchParams: Promise<{ address?: string }> }) {
  const { address: raw } = await searchParams;
  const address = raw?.trim() ?? '';
  const valid = isAddress(address);
  const data = valid ? await lookupQuest(address).catch(() => null) : null;

  return (
    <div className="frame max-w-4xl pb-24 pt-10 sm:pt-16">
      <header className="flex flex-col gap-4">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> BNB Chain · Set and Earn · {CAMPAIGN_END_LABEL}
        </span>
        <h1 className="t-h1">Your hires, across marketplaces</h1>
        <p className="t-lede">
          The hire track needs three different agents across at least two marketplaces. Pokter reads the hires made through BNB Chain&rsquo;s ERC-8183 escrow contracts, on mainnet and testnet, whichever marketplace made them. Marketplaces that settle through contracts of their own are not visible here, so a hire made that way will not appear.
        </p>
        <form action="/quest" className="flex flex-col gap-2 pt-2 sm:flex-row" role="search">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-rule-strong bg-paper px-3 focus-within:border-ink">
            <span className="sr-only">Wallet address</span>
            <Icon.Wallet size={16} className="shrink-0 text-ink-3" />
            <input name="address" defaultValue={address} placeholder="0x… the wallet you registered" spellCheck={false} autoComplete="off" className="t-readout min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:font-sans placeholder:text-ink-3" />
          </label>
          <button type="submit" className="h-11 rounded-[10px] bg-ink px-5 text-sm font-medium text-paper hover:brightness-110">
            Check
          </button>
        </form>
        <p className="text-[12.5px] text-ink-3">
          No wallet connection needed: everything here is public on chain. The rules are BNB Chain&rsquo;s;{' '}
          <a href={CAMPAIGN_RULES_URL} target="_blank" rel="noreferrer noopener" className="link">
            read them in full
          </a>
          .
        </p>
      </header>

      <div className="mt-10">
        {address && !valid && <p className="rounded-[12px] border border-rule bg-raised px-5 py-4 text-[14px] text-ink-2">That is not a wallet address. It starts with 0x and has 40 more characters.</p>}
        {valid && !data && <p className="rounded-[12px] border border-rule bg-raised px-5 py-4 text-[14px] text-ink-2">The escrow contracts could not be read just now. Try again in a moment.</p>}
        {data && (
          <>
            <p className="mb-4 text-[13px] text-ink-3">
              Wallet <span className="t-readout text-ink">{shortAddress(data.address)}</span>
            </p>
            <Result data={data} />
          </>
        )}
        {!address && (
          <p className="text-[14px] text-ink-2">
            Building an agent too? The build track is tracked in{' '}
            <Link href="/build" className="link">
              Builder Studio
            </Link>
            , and the steps are in the{' '}
            <Link href="/set-and-earn" className="link">
              Set and Earn guide
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
