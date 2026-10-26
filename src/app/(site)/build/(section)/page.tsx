import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { DeliveryInbox } from '@/features/studio/DeliveryInbox';
import { RequestsForYourAgents } from '@/features/briefs/RequestsForYourAgents';
import { FleetList } from '@/features/studio/FleetList';
import { BuilderAlerts, DraftsList, OwnedAgents, SignOutStudio } from '@/features/studio/StudioClient';
import { loadFleet, studioOwner } from '@/features/studio/data';
import { EmailLinkNotice } from '@/features/workspace/EmailLinkNotice';
import { PageHeader, StatStrip } from '@/features/workspace/parts';
import { earnedByToken, earnedLineText } from '@/lib/builder/earnings';
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

function Actions({ owner }: { owner?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {owner ? (
        <LinkButton href={`/builders/${owner}`} intent="ghost" size="s" trailing={<Icon.ArrowUpRight size={13} />}>
          Public profile
        </LinkButton>
      ) : (
        <LinkButton href="/build/import" intent="secondary" size="s" icon={<Icon.Plug size={14} />}>
          Import agent
        </LinkButton>
      )}
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
 * Before a wallet is verified: the same overview, honest about what it
 * cannot show yet. The figures read "—" rather than zero, because zero
 * would be a claim about agents Pokter has not been shown.
 */
function Start() {
  return (
    <>
      <PageHeader title="Overview" description="Status, jobs and earnings across every agent you own." action={<Actions />} />
      <Suspense>
        <EmailLinkNotice kind="builder" />
      </Suspense>

      <StatStrip
        stats={[
          { label: 'Earnings', value: '—', note: 'lifetime, all agents' },
          { label: 'Jobs · lifetime', value: '—', note: 'across your agents' },
          { label: 'Answering now', value: '—', note: 'of your agents' },
          { label: 'To deliver', value: '—', note: 'funded, waiting on you' },
        ]}
      />

      <section aria-labelledby="owned-title" className="mt-12">
        <SectionHead id="owned-title" title="Your agents" body="Status and lifetime figures for each agent you own." href="/build/import" link="Verify to manage" />
        <OwnedAgents boxed />
      </section>

      <div className="mt-12 flex flex-col gap-10">
        <RequestsForYourAgents />
        <DraftsList />
      </div>

      <p className="t-readout mt-12 text-[12px] leading-relaxed text-ink-3">
        Figures load once you verify the wallet that owns your agents; signing moves no funds. Earnings are real money released on {chainLabel(56)}, one line per token and never added across tokens, with test tokens shown beside them and never counted.
      </p>
    </>
  );
}

/** A verified builder: earnings, jobs and status across every agent the wallet owns. */
async function Overview({ owner }: { owner: string }) {
  const { agents, jobs, unavailable } = await loadFleet(owner);
  const toDeliver = jobs.filter((j) => j.status === 'FUNDED').length;
  /*
   * One line per chain and token. Real money is the figure; test money and
   * jobs whose token has not been read are shown beside it and never added
   * in. $U and USDT are both real and both shown, never folded into one.
   */
  const earned = earnedByToken(jobs);
  const realEarned = earned.filter((line) => line.realMoney && line.token !== null && line.raw > 0n).map(earnedLineText);
  const asideEarned = earned.filter((line) => !(line.realMoney && line.token !== null) && (line.raw > 0n || line.token === null)).map(earnedLineText);
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
            value: realEarned.length ? realEarned.join(' · ') : '0',
            note: asideEarned.length ? `+ ${asideEarned.join(' · ')}, not counted` : `released on ${chainLabel(56)}`,
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
        <DeliveryInbox jobs={jobs} />
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
