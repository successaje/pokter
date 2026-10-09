import type { Metadata } from 'next';
import Link from 'next/link';

import { CAMPAIGN_RULES_URL, isCampaignLive } from '@/lib/campaign/window';
import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { StartHiring } from '@/components/campaign/StartHiring';

const TITLE = 'How to complete Set and Earn';
const DESCRIPTION =
  'The two things a wallet has to do to qualify for BNB Chain’s Set and Earn, what counts, and the three build checks most agents fail. Closes 5 November, 12:00 UTC.';

/*
 * openGraph and twitter are set explicitly, not left to `title` and
 * `description`.
 *
 * Next fills the document title and meta description from those two, and
 * nothing else — the social tags keep falling through to the root layout.
 * Shared as it was, this page produced a card reading "Pokter — Choose what
 * deserves your money", which says nothing about the campaign to somebody
 * deciding whether to click.
 */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/set-and-earn/guide' },
  openGraph: {
    type: 'article',
    title: TITLE,
    description: DESCRIPTION,
    url: '/set-and-earn/guide',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

/** One numbered step. The number is decoration; the heading carries the meaning. */
function Step({
  n,
  title,
  lead,
  children,
}: {
  n: number;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${n}`} className="grid gap-5 sm:grid-cols-[3rem_minmax(0,1fr)]">
      <span
        aria-hidden
        className="mono hidden h-9 w-9 place-items-center rounded-full border border-line-strong text-caption text-ink-muted sm:grid"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 id={`step-${n}`} className="text-title">
            <span aria-hidden className="mono mr-2 text-ink-faint sm:hidden">{n}</span>
            {title}
          </h2>
          {lead && <p className="mt-1 text-body-s text-ink-muted">{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * How to finish the campaign, written for somebody who has not started.
 *
 * Pokter is one of nine shortlisted marketplaces and the rules require at
 * least two, so a guide that pretended Pokter was sufficient would be
 * wrong on its face and useless the moment somebody checked. It is more
 * valuable to be the page that explains the whole task accurately — the
 * parts that happen here and the parts that do not — than to be a page
 * that only sells the hire button.
 *
 * The three checks most builds fail are given their own section rather
 * than a footnote. Registering an agent is easy and qualifying is not,
 * and somebody who learns that on 5 November has wasted a month.
 */
export default function SetAndEarnGuide() {
  const bot = FAUCETS?.paymentTokenBot ?? null;
  const live = isCampaignLive();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 pb-20 pt-6 sm:gap-12 sm:pt-10">
      <header className="flex flex-col gap-3 border-b border-line pb-8">
        <p className="mono text-caption uppercase tracking-wide text-ink-faint">
          BNB Chain · Set and Earn{live ? '' : ' · closed'}
        </p>
        <h1 className="text-page">How to complete Set and Earn</h1>
        <p className="max-w-2xl text-body leading-relaxed text-ink-secondary">
          A wallet qualifies by doing two things: <b>hire three different agents
          across at least two marketplaces</b>, and <b>build and list one agent
          of your own</b>. The first 100 wallets to finish both receive the
          merch drop. Entries close <b>5 November, 12:00 UTC</b>.
        </p>
        <p className="text-small text-ink-muted">
          Pokter is one of the nine shortlisted marketplaces, so it can be one
          of your two — not both. These are BNB Chain’s rules, not ours;{' '}
          <a href={CAMPAIGN_RULES_URL} target="_blank" rel="noreferrer noopener" className="prose-link text-ink">
            read them in full
          </a>{' '}
          before you rely on this page.
        </p>
      </header>

      <Step
        n={1}
        title="Register before you do anything else"
        lead="Actions from unregistered wallets are not counted — including ones you already made."
      >
        <p className="text-body-s leading-relaxed text-ink-secondary">
          You register a name, the wallet you will use, and — for the build —
          your agent’s registry ID and chain, publicly visible on your GitHub.
          One wallet per person; operating several means disqualification
          rather than having the extras ignored.
        </p>
        <a
          href={CAMPAIGN_RULES_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="action-primary w-fit rounded-[var(--radius)] px-4 py-2.5 text-[12px] font-semibold"
        >
          Register on BNB Chain ↗
        </a>
      </Step>

      <Step
        n={2}
        title="Get testnet funds"
        lead="Both tokens are free and worth nothing. You need them before any hire or registration will go through."
      >
        <p className="text-body-s leading-relaxed text-ink-secondary">
          {NATIVE_SYMBOL} pays gas; the escrow token pays the agent. Testnet and
          mainnet hires both count, and testnet costs nothing.
        </p>
        {bot ? (
          <div className="rounded-[var(--radius-lg)] border border-line bg-canvas-subtle p-4">
            <p className="text-body-s font-medium">
              Message {bot.handle} and send one line:
            </p>
            <p className="mono mt-2 rounded-[var(--radius)] bg-surface p-3 text-small leading-5 text-ink-secondary">
              {bot.bothAsk.replace('ADDRESS', 'YOUR_WALLET_ADDRESS')}
            </p>
            <p className="mt-2.5 text-small leading-5 text-ink-muted">
              The bot sends both. The web faucet is an alternative for gas, but
              it asks the wallet to have mainnet history — a wallet made for
              this campaign will not have any, so the bot is the reliable route.
            </p>
            <a
              href={bot.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex text-small font-semibold text-[color:var(--brand-strong)]"
            >
              Open the faucet bot ↗
            </a>
          </div>
        ) : (
          <p className="text-body-s text-ink-muted">
            Faucet details appear here while the testnet campaign is running.
          </p>
        )}
      </Step>

      <Step
        n={3}
        title="Hire three agents, across two marketplaces"
        lead="Three different agents. At least two different shortlisted venues. Pokter can be one of them."
      >
        <ul className="flex flex-col gap-2 text-body-s leading-relaxed text-ink-secondary">
          <li>· The hire must come from your registered campaign wallet.</li>
          <li>· The agent must be <b>engaged</b>, not merely approved — a token approval with no hire event does not count.</li>
          <li>· It counts from the moment the hire event is emitted on chain.</li>
          <li>· Each of the three must be a <b>different agent</b>.</li>
        </ul>
        <p className="text-body-s leading-relaxed text-ink-secondary">
          Pokter only offers Hire on agents whose price the escrow can actually
          pay. Thirteen listings were withdrawn from that set for quoting
          another chain’s token — their hires would have funded a job the
          seller could never accept. What is below can complete.
        </p>
        <StartHiring />
      </Step>

      <Step
        n={4}
        title="Build and list one agent of your own"
        lead="This is the half most people underestimate. Registering is easy; qualifying is not."
      >
        <p className="text-body-s leading-relaxed text-ink-secondary">
          BNB Chain checks six things, all from on-chain data and public
          endpoints. Three are straightforward — registered and owned by your
          wallet, a resolvable agent card stating its category, and responding
          when probed. Pokter’s launchpad walks you through those, and there is
          a model-neutral prompt that will build the whole service with you.
        </p>
        <Link
          href="/build"
          className="action-primary w-fit rounded-[var(--radius)] px-4 py-2.5 text-[12px] font-semibold"
        >
          List an agent on Pokter
        </Link>
      </Step>

      {/*
        The three that actually fail people, given their own band. Each is
        something you cannot fix on the last day, which is the only reason
        this page exists rather than a link to the rules.
      */}
      <section aria-labelledby="hard" className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-caution/40 bg-caution-dim p-5 sm:p-6">
        <div>
          <p className="mono text-caption uppercase tracking-wide text-caution">Start these early</p>
          <h2 id="hard" className="mt-1.5 text-title">The three checks most agents fail</h2>
        </div>
        <dl className="flex flex-col gap-4 text-body-s leading-relaxed">
          <div>
            <dt className="font-semibold">Hired by others — 3 completed hires from 3 wallets that are not yours</dt>
            <dd className="mt-1 text-ink-secondary">
              And not funded by yours. Wallets sharing a funding source, or
              hiring each other in circles, are excluded. You cannot arrange
              this at the end; your agent has to be worth hiring.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Actually executes — 5 on-chain actions across 3 separate days</dt>
            <dd className="mt-1 text-ink-secondary">
              Three <em>separate days</em> is a calendar constraint, so the
              earliest you can finish is two days after you start. An agent
              that answers but never transacts has not done anything.{' '}
              <b>A hire through Pokter produces a written assessment, which is
              not an on-chain action</b> — your agent must also act from its own
              wallet.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Does what it says</dt>
            <dd className="mt-1 text-ink-secondary">
              Those actions must match the category you declared: a yield agent
              touching lending or vault contracts, a grid agent trading
              repeatedly, a rebalancing agent adjusting positions.
            </dd>
          </div>
        </dl>
        <p className="border-t border-caution/30 pt-3.5 text-small leading-5 text-ink-muted">
          Also not counted: agents listed before the Phase 2 announcement,
          clones of listed agents with cosmetic changes, and the same agent
          registered under several IDs. Your repository must be public.
        </p>
      </section>

      <section aria-labelledby="who" className="flex flex-col gap-3 border-t border-line pt-8">
        <h2 id="who" className="text-title">Who cannot enter</h2>
        <p className="text-body-s leading-relaxed text-ink-secondary">
          You must be 18 or over, outside sanctioned or restricted
          jurisdictions, and one wallet per person. Employees and contractors
          of BNB Chain, and members of any shortlisted marketplace team from
          Phase 1, are not eligible — <b>that includes everyone who works on
          Pokter</b>. We cannot enter our own campaign, and no hire we make
          counts toward anything.
        </p>
        <p className="text-small leading-5 text-ink-muted">
          BNB Chain does not operate Pokter or the agents listed on it, has not
          audited them, and guarantees no outcome. Check permissions and spend
          caps before hiring. BNB Chain’s determination on qualification is
          final.
        </p>
      </section>

      <p className="text-small text-ink-muted">
        Track what Pokter can verify of your progress on the{' '}
        <Link href="/set-and-earn" className="prose-link text-ink">campaign page</Link>.
        Two of the six build checks happen in your own wallet and repository,
        so Pokter cannot see them and does not count them.
      </p>
    </main>
  );
}
