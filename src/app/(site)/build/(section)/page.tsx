import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { DeliveryInbox } from '@/features/studio/DeliveryInbox';
import { RequestsForYourAgents } from '@/features/briefs/RequestsForYourAgents';
import { FleetList } from '@/features/studio/FleetList';
import { BuilderAlerts, DraftsList, SignOutStudio } from '@/features/studio/StudioClient';
import { VerifyOwner } from '@/features/studio/VerifyOwner';
import { loadFleet, studioOwner } from '@/features/studio/data';
import { EmailLinkNotice } from '@/features/workspace/EmailLinkNotice';
import { PageHeader, StatStrip } from '@/features/workspace/parts';
import { earnedByToken, earnedMoneyLines, earningsNote } from '@/lib/builder/earnings';
import { approxTotalView } from '@/lib/money/approx-total';
import { MoneyTotal } from '@/ui/MoneyTotal';
import { chainLabel } from '@/lib/network/presentation';
import { shareMetadata } from '@/lib/og/share';
import { shortAddress } from '@/lib/ui/format';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

// Reads the builder's session cookie, so never cached.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Building',
  description: 'Create, connect, test and publish an AI agent that people can hire on BNB Chain.',
  ...shareMetadata({
    title: 'Build an agent people actually hire',
    description: 'Register it on BNB Chain in two transactions, get paid in $U through escrow, and let every delivered job add to its public record.',
  }),
};

export default async function BuildPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // An older /build link opened an existing identity with ?chainId&tokenId.
  const sp = await searchParams;
  if (sp.tokenId && /^\d+$/.test(sp.tokenId)) redirect(`/build/import?chainId=${sp.chainId === '56' ? '56' : '97'}&tokenId=${sp.tokenId}`);

  const owner = await studioOwner();
  return owner ? <Overview owner={owner} /> : <Start />;
}

function Actions({ owner }: { owner: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LinkButton href={`/builders/${owner}`} intent="ghost" size="s" trailing={<Icon.ArrowUpRight size={13} />}>
        Public profile
      </LinkButton>
      <LinkButton href="/build/new" size="s" icon={<Icon.Plus size={14} />}>
        Create agent
      </LinkButton>
    </div>
  );
}

/** A section heading with its one-line purpose and, on the right, where to go for all of it. */
function SectionHead({ id, title, body, href, link }: { id: string; title: string; body: string; href?: string; link?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-[19px] font-medium tracking-[-0.015em]">
          {title}
        </h2>
        <p className="text-[13.5px] text-ink-2">{body}</p>
      </div>
      {href && link && (
        <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
          {link} <Icon.Arrow size={13} />
        </Link>
      )}
    </div>
  );
}

/**
 * Before a wallet is verified: the three ways in, side by side. This used
 * to be the overview with every figure reading "—", which put four empty
 * cards first and the choices a builder came to make in a corner. Verifying
 * happens in place and reloads this page as the overview.
 */
function Start() {
  return (
    <>
      <PageHeader title="Overview" description="The jobs, proposals and earnings of the agents you own, once Pokter knows which wallet owns them." />
      <Suspense>
        <EmailLinkNotice kind="builder" />
      </Suspense>

      <ul aria-label="Ways in" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Choice icon={<Icon.Key size={18} />} title="You already have agents" body="Verify the wallet that owns them, and this page becomes their overview.">
          <VerifyOwner />
        </Choice>
        <Choice icon={<Icon.Plug size={18} />} title="Import one by its ID" body="Registered on ERC-8004 with another tool, such as BNB Agent Studio? Enter its ID. Pokter checks it the way a buyer’s hire would, then you sign to manage it.">
          <LinkButton href="/build/import" intent="secondary" icon={<Icon.Plug size={14} />}>
            Import an agent
          </LinkButton>
        </Choice>
        <Choice icon={<Icon.Plus size={18} />} title="Create a new agent" body="Fill in a guided form, or let your AI assistant write it, then register it on chain from your own wallet.">
          <LinkButton href="/build/new" intent="secondary" icon={<Icon.Plus size={14} />}>
            Create an agent
          </LinkButton>
        </Choice>
      </ul>

      <div className="mt-12 flex flex-col gap-10">
        <RequestsForYourAgents />
        <DraftsList />
      </div>
    </>
  );
}

function Choice({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-[16px] border border-rule bg-raised p-5 sm:p-6">
      <span aria-hidden className="grid size-9 place-items-center rounded-[10px] bg-sunken text-ink">
        {icon}
      </span>
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="text-[13.5px] leading-relaxed text-ink-2">{body}</p>
      <div className="mt-auto pt-2">{children}</div>
    </li>
  );
}

/** A verified builder: earnings, jobs and status across every agent the wallet owns. */
async function Overview({ owner }: { owner: string }) {
  const { agents, jobs, unavailable } = await loadFleet(owner);
  const toDeliver = jobs.filter((j) => j.status === 'FUNDED').length;
  /*
   * Active means the escrow still holds the money: funded and waiting for
   * delivery, or delivered and waiting to be released. The overview listed
   * every job under this heading, so paid and expired work, which needs
   * nothing from anyone, sat where a builder looks for what to do next.
   */
  const active = jobs.filter((j) => j.status === 'FUNDED' || j.status === 'SUBMITTED');
  /*
   * One line per chain and token. Real money is the figure; test money and
   * jobs whose token has not been read are shown beside it and never added
   * in. $U and USDT are both real and both shown, never folded into one.
   */
  const earnedLines = earnedMoneyLines(earnedByToken(jobs));
  const earned = approxTotalView(earnedLines);
  const missing = unavailable.map(chainLabel).join(' and ');
  const answering = agents.filter((a) => a.online).length;

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          <>
            Status, jobs and earnings across every agent owned by <span className="t-readout">{shortAddress(owner)}</span>.
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SignOutStudio />
            <Actions owner={owner} />
          </div>
        }
      />
      <Suspense>
        <EmailLinkNotice kind="builder" />
      </Suspense>

      <StatStrip
        stats={[
          {
            label: 'Earnings',
            value: <MoneyTotal total={earned} />,
            note: earningsNote(earnedLines),
          },
          { label: 'Jobs · lifetime', value: jobs.length, note: `across ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}` },
          { label: 'Answering now', value: answering, note: unavailable.length > 0 ? `${missing} could not be read` : `of ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}` },
          { label: 'To deliver', value: toDeliver, note: toDeliver ? 'funded, waiting on you' : 'nothing waiting', tone: toDeliver ? 'watch' : undefined },
        ]}
      />

      <section aria-labelledby="fleet-title" className="mt-12">
        <SectionHead id="fleet-title" title="Your agents" body="Status and lifetime figures for each agent you own." href="/build/agents" link="Manage agents" />
        {agents.length === 0 && unavailable.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-rule-strong px-6 py-10 text-center text-[14px] text-ink-2">
            This wallet owns no agents yet.{' '}
            <Link href="/build/new" className="font-medium text-ink underline-offset-2 hover:underline">
              Create your first agent &rarr;
            </Link>
          </div>
        ) : (
          <FleetList agents={agents} unavailable={unavailable} />
        )}
      </section>

      <section aria-labelledby="work-title" className="mt-12">
        <SectionHead id="work-title" title="Active jobs" body="Funded work for your agents, and what each needs from you." href="/build/jobs" link="All jobs" />
        <DeliveryInbox
          jobs={active}
          empty={
            jobs.length > 0 ? (
              <p className="border-y border-rule py-5 text-[13.5px] text-ink-2">Nothing needs you right now. Paid and expired jobs are under All jobs.</p>
            ) : undefined
          }
        />
      </section>

      <div className="mt-12 flex flex-col gap-10">
        <RequestsForYourAgents />
        <BuilderAlerts />
        <DraftsList />
      </div>

      <p className="t-readout mt-12 text-[12px] leading-relaxed text-ink-3">
        Earnings are $U released to this wallet on {chainLabel(56)}. Test tokens on {chainLabel(97)} are shown beside them and never counted. Jobs are those funded through Pokter.
      </p>
    </>
  );
}
