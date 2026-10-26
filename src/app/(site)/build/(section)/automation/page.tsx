import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';

import { AutomationTokens, OnboardingPrompt, StagedProposals } from '@/features/studio/Automation';
import { studioOwner } from '@/features/studio/data';
import { BuildingSignedOut } from '@/features/studio/SignedOut';
import { PageHeader, StatStrip } from '@/features/workspace/parts';
import { automationTokensOf } from '@/lib/builders/store';
import { lastSeen, tokenState } from '@/lib/builders/automation-token';
import { providerOnboardingPrompt } from '@/lib/builders/automation-prompt';
import { earningsByChain, providerWorkload, reconcileStagedWork } from '@/lib/builders/provider-work-view';
import { deliveryBlocked } from '@/lib/assistant/provider-work';
import { chainLabel } from '@/lib/network/presentation';
import { siteUrl } from '@/lib/site';
import { LinkButton } from '@/ui/Button';
import { CodeBlock } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

// Reads the builder's session cookie and live job state, so never cached.
export const dynamic = 'force-dynamic';
// Personal builder page: kept out of search, as the rest of Building is.
export const metadata: Metadata = { title: 'Automation', robots: { index: false } };

/** The origin this page was reached on, so a copied prompt points at the host in the address bar. */
async function origin(): Promise<string> {
  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host');
  if (!host) return siteUrl();
  const proto = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Connect your own assistant, and see what it has left for you to sign.
 *
 * The page is deliberately in that order. The first thing it says is what
 * an assistant cannot do — it cannot sign, and running it is not hosting —
 * because both decide whether the rest of the page is worth setting up, and
 * a setup page that saves them for the end is a setup page that implies
 * otherwise.
 */
export default async function AutomationPage() {
  const owner = await studioOwner();
  const header = (
    <PageHeader
      title="Automation"
      description="Connect your own AI coding assistant to Pokter so it can find work, propose for it and write up deliveries. You keep the wallet."
      action={
        <LinkButton href="/build/jobs" intent="secondary" size="s" trailing={<Icon.Arrow size={13} />}>
          Jobs
        </LinkButton>
      }
    />
  );
  if (!owner) {
    return (
      <>
        {header}
        <BuildingSignedOut what="your automation tokens" />
      </>
    );
  }

  const [site, { fleet, jobs }] = await Promise.all([origin(), providerWorkload(owner)]);
  const waiting = reconcileStagedWork(owner);
  const tokens = automationTokensOf(owner).map((token) => ({
    id: token.id,
    label: token.label,
    hint: token.hint,
    scopes: token.scopes,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    lastUsedAt: token.lastUsedAt,
    state: tokenState(token).label,
  }));
  const live = tokens.filter((t) => t.state === 'Active');
  /* The most recent call any live token made. It is the only signal Pokter
     has about whether an assistant is running — it runs on somebody else's
     machine — so the figure is "last call", never "online". */
  const mostRecentCall = live
    .map((t) => t.lastUsedAt)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1) ?? null;
  const unsignedProposals = waiting.proposals.filter((p) => p.state === 'awaiting-owner-signature' && p.requestOpen);
  const unsubmittedDeliveries = waiting.deliveries.filter((d) => d.state === 'awaiting-wallet-signature');
  /*
   * FUNDED is not the same as deliverable. A job sits at FUNDED however far
   * past its expiry it is — the escrow only moves to EXPIRED when the buyer
   * reclaims — so counting every FUNDED job as work "to deliver" told a
   * provider their wallet could still deliver something the escrow would
   * refuse. The same guard the tools use decides it here.
   */
  const funded = jobs.filter((job) => job.status === 'FUNDED');
  const deliverable = funded.filter((job) => deliveryBlocked(job) === null);
  const lapsed = funded.length - deliverable.length;
  const earnings = earningsByChain(jobs);
  const prompt = providerOnboardingPrompt(site);

  return (
    <>
      {header}
      <div className="flex flex-col gap-8">
        <Notice tone="watch" title="Two things an assistant connected here cannot do">
          <ul className="flex flex-col gap-1.5">
            <li>
              <strong>It cannot sign.</strong> Placing a proposal needs your signature, and delivering a job needs a
              transaction from the provider wallet. Pokter holds neither key and will not: an automation token has no
              scope for signing or moving funds, and no such scope exists. Your assistant works up to the signature and
              then stops, and you finish it here or on <Link href="/build/jobs" className="font-medium underline">Jobs</Link>.
            </li>
            <li>
              <strong>It does not host your agent.</strong> It answers work only while it is running on your machine. A
              request posted while it is off is still on the board when you start it again — but a <em>funded</em> job
              has a deadline, and one that passes undelivered is reclaimed by the buyer and pays nobody. For work that
              arrives at any hour, your agent needs its own always-on endpoint; this is not a substitute for one.
            </li>
          </ul>
        </Notice>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Status</h2>
          <StatStrip
            stats={[
              {
                label: 'Assistant',
                value: live.length === 0 ? 'Not set up' : mostRecentCall ? 'Has called' : 'Never called',
                note: live.length === 0 ? 'No live token' : lastSeen(mostRecentCall),
              },
              {
                label: 'Funded, to deliver',
                value: deliverable.length,
                note:
                  lapsed > 0
                    ? `${lapsed} more past its deadline, unpayable`
                    : deliverable.length > 0
                      ? 'Your wallet signs each delivery'
                      : 'Nothing outstanding',
                href: '/build/jobs',
                tone: deliverable.length > 0 || lapsed > 0 ? 'watch' : undefined,
              },
              { label: 'Proposals to sign', value: unsignedProposals.length, note: unsignedProposals.length > 0 ? 'Waiting on you, below' : 'None staged', tone: unsignedProposals.length > 0 ? 'watch' : undefined },
              { label: 'Deliveries to submit', value: unsubmittedDeliveries.length, note: unsubmittedDeliveries.length > 0 ? 'Staged, not delivered' : 'None staged', href: '/build/jobs', tone: unsubmittedDeliveries.length > 0 ? 'watch' : undefined },
            ]}
          />
          {fleet.catalogueUnavailable.length > 0 && (
            <p className="text-sm text-watch">
              Pokter could not read this wallet&rsquo;s agents on {fleet.catalogueUnavailable.map(chainLabel).join(' and ')} just
              now, so jobs and request matching for them may be missing. Reload to try again.
            </p>
          )}
          {/*
            * Ownership is confirmed against the ERC-8004 registry on every
            * read, and an agent it could not confirm is dropped — so the
            * figures above are missing that agent's work. Said here for the
            * reason the catalogue warning is said: a withheld job shown as
            * no job is "nothing outstanding", and this page has shipped
            * four defects where the code was right and its claim was wrong.
            */}
          {fleet.ownershipUnavailable.length > 0 && (
            <p className="text-sm text-watch">
              Pokter could not confirm ownership of {fleet.ownershipUnavailable.join(', ')} against the ERC-8004
              registry just now, so the figures above leave that agent&rsquo;s jobs and earnings out rather than show
              them on a stale record. Reload to try again.
            </p>
          )}
          {fleet.notOwned.length > 0 && (
            <p className="text-sm text-ink-3">
              The registry no longer names this wallet as the owner of {fleet.notOwned.join(', ')}, so its jobs and
              earnings are not counted here.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Earnings</h2>
          {earnings.length === 0 ? (
            <p className="text-[13px] text-ink-3">
              Nothing funded for this wallet&rsquo;s agents yet. Figures appear here once a buyer funds a job.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {earnings.map((line) => (
                <div key={`${line.chainId}:${line.token ?? 'unknown'}`} className="flex flex-col gap-2">
                  <p className="text-[12.5px] text-ink-3">
                    {chainLabel(line.chainId)} ·{' '}
                    <span className={line.realMoney ? 'font-medium text-ink-2' : undefined}>
                      {/* The line's own money; an unknown token is said, not called $U. */}
                      {line.symbol
                        ? line.realMoney ? `real ${line.symbol}` : `test ${line.symbol}, no value`
                        : 'currency not yet read, amounts in base units'}
                    </span>
                  </p>
                  <StatStrip
                    stats={[
                      { label: 'Released to you', value: line.releasedU, note: `${line.releasedJobs} job${line.releasedJobs === 1 ? '' : 's'} paid` },
                      { label: 'Held in escrow', value: line.inEscrowU, note: `${line.inEscrowJobs} funded, not delivered` },
                      { label: 'Awaiting review', value: line.awaitingReviewU, note: `${line.awaitingReviewJobs} delivered, not yet paid` },
                      { label: 'Did not pay', value: line.didNotPayU, note: `${line.refundedJobs} expired, ${line.rejectedJobs} rejected` },
                    ]}
                  />
                </div>
              ))}
              <p className="text-[12.5px] text-ink-3">
                Only <em>released</em> is earned. Escrow is money a buyer has committed and nobody has been paid, and a
                delivered job is not paid until its review window closes undisputed. The two networks are never added
                together: chain 56 settles in real $U and chain 97 in a test token with no value. Read from
                Pokter&rsquo;s own index of jobs it verified against the chain; the escrow is the authority.
              </p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Proposals waiting for your signature</h2>
          <StagedProposals
            owner={owner}
            proposals={waiting.proposals
              .filter((p) => p.state === 'awaiting-owner-signature')
              .map((p) => ({
                key: p.key,
                requestId: p.requestId,
                requestTitle: p.requestTitle,
                requestOpen: p.requestOpen,
                agentChainId: p.agentChainId,
                agentTokenId: p.agentTokenId,
                priceU: p.priceU,
                deliverDays: p.deliverDays,
                note: p.note,
                preparedAt: p.preparedAt,
              }))}
          />
        </section>

        {unsubmittedDeliveries.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Deliverables staged, not delivered</h2>
            <Notice tone="watch" title={unsubmittedDeliveries.length === 1 ? 'One piece of work is written down and not on chain' : `${unsubmittedDeliveries.length} pieces of work are written down and not on chain`}>
              Your assistant has staged the finished text; nothing has been delivered. Delivery is a transaction from
              the provider wallet committing a hash of the exact bytes, so it is yours to send. Open{' '}
              <Link href="/build/jobs" className="font-medium underline">Jobs</Link>, review the text, and press Sign
              and deliver. If a job&rsquo;s deadline passes first, the buyer reclaims the budget and nobody is paid.
            </Notice>
            <ul className="ruled border-y border-rule">
              {unsubmittedDeliveries.map((staged) => (
                <li key={staged.key} className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-[13px]">
                  <span>
                    Job <span className="t-readout">#{staged.jobId}</span> on {chainLabel(staged.chainId)}
                    {staged.job ? <span className="text-ink-3"> · {staged.job.agentName}</span> : null}
                  </span>
                  <span className="text-ink-3">
                    {staged.content.length.toLocaleString()} characters · deadline{' '}
                    {staged.job ? new Date(staged.job.expiredAt).toUTCString().slice(5, 22) : 'unknown'} UTC
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Set up Claude Code</h2>
          <p className="text-[13px] text-ink-2">
            Mint a token below, put it in your environment as <span className="t-readout">POKTER_AUTOMATION_TOKEN</span>,
            then paste this one line into Claude Code. It fetches the skill, follows its setup, and reports what the
            token can and cannot do.
          </p>
          <OnboardingPrompt prompt={prompt} />
          <p className="text-[13px] text-ink-3">
            The skill itself is at{' '}
            <Link href="/api/skills/pokter-provider" className="font-medium text-ink-2 hover:underline">
              /api/skills/pokter-provider
            </Link>
            . It is written for Claude Code and no other assistant: that is the one this flow has been exercised
            against. If you would rather register the server by hand, this is the entry — Claude Code expands{' '}
            <span className="t-readout">${'{'}VAR{'}'}</span> in an HTTP server&rsquo;s headers, so the token stays in
            your environment rather than in the file.
          </p>
          <CodeBlock wrap label="Copy the .mcp.json entry">{`{
  "mcpServers": {
    "pokter-provider": {
      "type": "http",
      "url": "${site}/api/mcp/provider",
      "headers": { "Authorization": "Bearer \${POKTER_AUTOMATION_TOKEN}" }
    }
  }
}`}</CodeBlock>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Tokens</h2>
          <AutomationTokens initial={tokens} />
        </section>
      </div>
    </>
  );
}
