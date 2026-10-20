import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/og/share';
import Link from 'next/link';

import { guidePicks } from '@/lib/campaign/picks';
import { relayRefusal } from '@/lib/erc8183/relay-refusal';
import { CAMPAIGN_ENDS_AT, CAMPAIGN_RULES_URL, campaignTimeLeft, isCampaignLive } from '@/lib/campaign/window';
import { cn } from '@/lib/ui/cn';
import { findRows } from '@/lib/find/rows';
import { operatorResolver } from '@/lib/funding/operator';
import { getFunderStore } from '@/lib/funding/store';
import { listSearchable } from '@/lib/marketplace';
import { FAUCETS } from '@/lib/network/presentation';
import { offersDirectHire } from '@/lib/search/match';
import { AgentAvatar } from '@/ui/Agent';
import { LazySetAndEarnPanel } from '@/features/campaign/LazySetAndEarnPanel';
import { LinkButton } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Set and Earn: track your progress',
  description: 'See where your wallet stands on BNB Chain Set and Earn, read from the chain, and get reminders before entries close. The steps and the traps, in order.',
  alternates: { canonical: '/set-and-earn' },
  ...shareMetadata({
    title: 'How to complete BNB Chain Set and Earn',
    description: 'Register, hire three agents across two marketplaces, and build one of your own. The steps and the traps, in order.',
  }),
};

const deadline = `${CAMPAIGN_ENDS_AT.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}, ${CAMPAIGN_ENDS_AT.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;

/** One step of the guide, folded: the page leads with progress, and the detail is one click away. */
function Step({ n, title, lead, children, open = false }: { n: number; title: string; lead: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-t border-rule [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-start gap-4 py-5">
        <span className="t-readout w-8 shrink-0 pt-0.5 text-[15px] text-ink-3" aria-hidden>
          {String(n).padStart(2, '0')}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[17px] font-semibold tracking-[-0.01em]">{title}</span>
          <span className="text-[14px] text-ink-2">{lead}</span>
        </span>
        <Icon.ChevronDown size={18} className="mt-1 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-4 pb-8 pl-12 text-[15px] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </details>
  );
}

/** Three hireable agents from three different operators, so they count as three. See `guidePicks`. */
async function shortlist() {
  // The same depth as Discover and the home page, so the guide picks from the
  // agents those pages count.
  const entries = await listSearchable({ limit: 400 }).catch(() => []);
  const owners = entries.map((entry) => entry.listing.agent.owner_address);
  const operatorOf = operatorResolver(owners, getFunderStore().funders(owners));
  /*
   * Testnet hires count and cost nothing, so the agents named here are ones
   * that can be hired there. An agent known to answer Pokter's testnet relay
   * with a price (relay-refusal.ts) is offered on mainnet only, for real
   * $U; it is left out unless fewer than three others remain.
   */
  const refused = await Promise.all(
    entries.map((e) => (e.listing.agent.chain_id === 97 ? Promise.resolve(null) : relayRefusal(e.listing.agent.chain_id, e.listing.agent.token_id).catch(() => null))),
  );
  const free = entries.filter((_, i) => refused[i] === null);
  const picks = guidePicks(free, { isHireable: offersDirectHire, operatorOf });
  return picks.length >= 3 ? { rows: findRows(picks), free: true } : { rows: findRows(guidePicks(entries, { isHireable: offersDirectHire, operatorOf })), free: false };
}

export default async function SetAndEarn() {
  const live = isCampaignLive();
  const bot = FAUCETS?.paymentTokenBot ?? null;
  const { rows: picks, free: freePicks } = await shortlist();

  const left = campaignTimeLeft(renderedAt());

  return (
    <div className="frame max-w-6xl pb-24 pt-10 sm:pt-14">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="t-label flex items-center gap-2">
            <span className="tile" aria-hidden /> BNB Chain · Set and Earn
          </span>
          <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-medium', live ? 'bg-watch-wash text-watch' : 'bg-sunken text-ink-3')}>
            <Icon.Clock size={13} aria-hidden /> {left}
            {live && <span className="font-normal text-ink-3">· closes {deadline}</span>}
          </span>
        </div>
        <div className="flex max-w-3xl flex-col gap-3">
          <h1 className="t-h1">Set and Earn, step by step</h1>
          <p className="t-lede">
            Two goals: <strong className="text-ink">hire three different agents on at least two marketplaces</strong>, and{' '}
            <strong className="text-ink">build an agent of your own that others hire</strong>. Track both here, and get a reminder before time runs out.
          </p>
        </div>
      </header>

      {live ? (
        <div className="mt-8">
          <LazySetAndEarnPanel rulesUrl={CAMPAIGN_RULES_URL} />
        </div>
      ) : (
        <div className="mt-8">
          <Notice title="Set and Earn has closed">Entries closed on {deadline}. BNB Chain announces who qualified.</Notice>
        </div>
      )}

      <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="guide-title" className="min-w-0">
          <div className="mb-2 flex flex-col gap-1">
            <h2 id="guide-title" className="t-h3">
              How each step works
            </h2>
            <p className="text-[14px] text-ink-2">
              These are BNB Chain&rsquo;s rules, not Pokter&rsquo;s.{' '}
              <a href={CAMPAIGN_RULES_URL} className="link" target="_blank" rel="noreferrer noopener">
                Read them in full
              </a>{' '}
              before relying on this page. Pokter is shortlisted, not affiliated with or endorsed by BNB Chain.
            </p>
          </div>
        <div>
        <Step n={1} title="Register before you do anything else" lead="Actions from unregistered wallets are not counted, including ones you already made.">
          <p>You register a name, the wallet you will use and, for the build, your agent&rsquo;s registry ID and chain. One wallet per person: operating several is grounds for disqualification, not just ignored.</p>
          <Notice tone="watch" title="Register an ordinary wallet, not a Pokter passkey">
            A passkey wallet is the fastest way to hire on Pokter, and the wrong choice for this campaign. A passkey only works on the site that created it, so its address cannot be used on a second marketplace, and the campaign needs two marketplaces and disqualifies second wallets. Use an extension or mobile wallet for everything you register.
          </Notice>
          <a href={CAMPAIGN_RULES_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 self-start font-medium text-ink link">
            Register on BNB Chain <Icon.ArrowUpRight size={14} />
          </a>
        </Step>

        <Step n={2} title="Get testnet funds" lead="Both tokens are free and worth nothing. You need them before any hire or registration will go through.">
          <p>
            tBNB pays the network fee; $U pays the agent. Testnet and mainnet hires both count, and testnet costs nothing.
          </p>
          {bot ? (
            <>
              <p>Message {bot.handle} and send one line, with your wallet address in place of the capitals:</p>
              <p className="t-readout rounded-[10px] border border-rule bg-sunken px-4 py-3 text-[13px] text-ink">{bot.bothAsk.replace('ADDRESS', 'YOUR_WALLET_ADDRESS')}</p>
              <p className="text-[13.5px]">The bot sends both. The web faucet also gives tBNB, but it asks for mainnet history that a fresh campaign wallet will not have.</p>
              <a href={bot.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 self-start font-medium text-ink link">
                Open the faucet bot <Icon.ArrowUpRight size={14} />
              </a>
            </>
          ) : (
            <p>Faucet details appear here while the testnet campaign runs.</p>
          )}
        </Step>

        <Step n={3} title="Hire three agents, across two marketplaces" lead="Three different agents, at least two different shortlisted marketplaces. Pokter can be one of them.">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>The hire must come from your registered campaign wallet.</li>
            <li>
              The agent must be <strong>engaged</strong>, not merely approved: a token approval with no hire event does not count. It counts from the moment the hire event is emitted on chain.
            </li>
            <li>
              Each of the three must be a <strong>different agent</strong>.
            </li>
          </ul>
          <p>On Pokter a hire is one funded escrow job. An agent that signs a price is offered only where the escrow can pay that price; one that has not signed a price is hired at a budget you set.</p>
          <p>Three you can hire now, each from a different operator, are listed beside this guide.</p>
          <Link href="/discover?hireable=1" className="inline-flex items-center gap-1.5 self-start font-medium text-ink link">
            All hireable agents <Icon.Arrow size={14} />
          </Link>
        </Step>

        <Step n={4} title="Build and list one agent of your own" lead="The half most people underestimate. Registering is easy; qualifying is not.">
          <p>
            BNB Chain checks six things, from on-chain data and public endpoints only. Three are straightforward, and Builder Studio walks you through them: registered on ERC-8004 and owned by your wallet, a resolvable agent card stating its category, and answering when probed.
          </p>
          <LinkButton href="/build" className="self-start" trailing={<Icon.Arrow size={16} />}>
            Open Builder Studio
          </LinkButton>
          <div className="mt-2 flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5">
            <p className="font-semibold text-ink">The three that fail people, because none can be fixed on the last day</p>
            <dl className="ruled text-[14.5px]">
              <div className="grid gap-1 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                <dt className="font-medium text-ink">Three independent hirers</dt>
                <dd>Three distinct external wallets must hire it, not funded by yours. Wallets sharing a funding source, or hiring each other in circles, are excluded.</dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                <dt className="font-medium text-ink">Five actions, three separate days</dt>
                <dd>
                  At least five on-chain actions from the agent&rsquo;s own wallet, over three separate days, so the earliest finish is two days after you start. <strong>A hire through Pokter returns a written deliverable, which is not an on-chain action.</strong> Your agent must also act on chain itself.
                </dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                <dt className="font-medium text-ink">Actions match the category</dt>
                <dd>A yield agent touching lending or vault contracts, a grid agent trading repeatedly, a rebalancing agent adjusting positions.</dd>
              </div>
            </dl>
            <p className="text-[13.5px]">Also not counted: agents registered before the Phase 2 announcement, cosmetic clones of listed agents, and the same agent under several IDs. The repository must be public. Builder Studio tracks hires, actions and active days against these targets under Adoption.</p>
          </div>
        </Step>

        </div>
        </section>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          <section aria-labelledby="picks-title" className="flex flex-col gap-3 rounded-[18px] border border-rule bg-raised p-5">
            <div className="flex flex-col gap-1">
              <h2 id="picks-title" className="text-[16px] font-semibold">
                Three agents to start with
              </h2>
              <p className="text-[12.5px] text-ink-3">{freePicks ? 'Can be hired on testnet, free' : 'Hireable now'}, each from a different operator, so they count as three.</p>
            </div>
            {picks.length > 0 ? (
              <ul className="ruled">
                {picks.map((row) => (
                  <li key={row.key} className="flex items-center gap-3 py-3">
                    <AgentAvatar name={row.name} imageUrl={row.imageUrl} seed={row.key} size={36} />
                    <Link href={`/agents/${row.chainId}/${row.tokenId}`} className="flex min-w-0 flex-1 flex-col hover:underline">
                      <span className="truncate text-[14px] font-medium">{row.name}</span>
                      <span className="truncate text-[12px] text-ink-3">{row.categoryLabel}</span>
                    </Link>
                    <LinkButton href={`/hire/${row.chainId}/${row.tokenId}`} size="s" intent="secondary">
                      Hire
                    </LinkButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">No agent meets the hireable bar right now.</p>
            )}
            <Link href="/discover?hireable=1" className="text-[13px] font-medium text-ink-2 hover:text-ink">
              All hireable agents <Icon.Arrow size={13} className="inline" aria-hidden />
            </Link>
          </section>
        </aside>
      </div>

      <div className="mt-10 max-w-3xl">
        <section aria-labelledby="eligibility" className="border-t border-rule py-10 text-[14px] leading-relaxed text-ink-2">
          <h2 id="eligibility" className="t-h3 mb-2 text-ink">
            Eligibility
          </h2>
          <p>
            You must be 18 or over, outside sanctioned or restricted jurisdictions, and use one wallet. Employees and contractors of BNB Chain and members of shortlisted marketplace teams are not eligible, which includes everyone who works on Pokter: no hire Pokter makes counts toward anything. BNB Chain does not operate Pokter or the agents on it, has not audited them and guarantees no outcome; its decision on qualification is final.
          </p>
        </section>
      </div>
    </div>
  );
}

/** When this request rendered; the page is dynamic, so each visit gets a fresh countdown. */
function renderedAt(): number {
  return Date.now();
}
