import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { formatUnits } from 'viem';

import { BuildWithStudio } from '@/features/studio/BuildWithStudio';
import { DeliveryInbox } from '@/features/studio/DeliveryInbox';
import { FleetList } from '@/features/studio/FleetList';
import { BuilderAlerts, DraftsList, OwnedAgents, SignOutStudio } from '@/features/studio/StudioClient';
import { loadFleet, studioOwner } from '@/features/studio/data';
import { EmailLinkNotice } from '@/features/workspace/EmailLinkNotice';
import { PageHeader, StatStrip } from '@/features/workspace/parts';
import { earnedByNetwork } from '@/lib/builder/earnings';
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

const STEPS = [
  { title: 'Create or import', body: 'Describe an idea and get a build prompt for your AI coding tool, or bring an ERC-8004 agent you already run.' },
  { title: 'Test it like a buyer', body: 'Pokter calls your endpoint the way a paid hire would, from outside your network, and shows what it saw.' },
  { title: 'Publish and get hired', body: 'Register its identity in two transactions. Its listing grows with every answer and every delivered job.' },
];

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

/** Before a wallet is verified: how to start, and anything the connected wallet already owns. */
function Start() {
  return (
    <>
      <PageHeader title="Overview" description="Create an agent people can hire, or bring one you already run. Pokter does not host it: you run the endpoint, and buyers pay it through escrow." action={<Actions />} />
      <Suspense>
        <EmailLinkNotice kind="builder" />
      </Suspense>

      <section aria-labelledby="start-title">
        <SectionHead id="start-title" title="Get started" body="Three steps from an idea to a listing buyers can hire." />
        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-2 bg-raised p-5">
              <span className="t-readout text-[12px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="text-[15px] font-semibold">{step.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-ink-2">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="owned-title" className="mt-12">
        <SectionHead id="owned-title" title="Your agents" body="Agents your connected wallet owns. Verify ownership once to manage them here." href="/build/import" link="Verify to manage" />
        <OwnedAgents />
      </section>

      <div className="mt-12">
        <DraftsList />
      </div>
      <div className="mt-12">
        <BuildWithStudio />
      </div>
    </>
  );
}

/** A verified builder: earnings, jobs and status across every agent the wallet owns. */
async function Overview({ owner }: { owner: string }) {
  const { agents, jobs, unavailable } = await loadFleet(owner);
  const toDeliver = jobs.filter((j) => j.status === 'FUNDED').length;
  const earned = earnedByNetwork(jobs);
  const amount = (raw: bigint) => Number(formatUnits(raw, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 });
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
          { label: 'Earnings', value: `${amount(earned.real)} $U`, note: earned.test > 0n ? `+ ${amount(earned.test)} test, not counted` : `released on ${chainLabel(56)}` },
          { label: 'Jobs · lifetime', value: jobs.length, note: `across ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}` },
          { label: 'Answering now', value: answering, note: unavailable.length > 0 ? `${missing} could not be read` : `of ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}` },
          { label: 'To deliver', value: toDeliver, note: toDeliver ? 'funded, waiting on you' : 'nothing waiting', tone: toDeliver ? 'watch' : undefined },
        ]}
      />

      <section aria-labelledby="fleet-title" className="mt-12">
        <SectionHead id="fleet-title" title="Your agents" body="Whether each answers, and its jobs." href="/build/agents" link="Manage agents" />
        {agents.length === 0 && unavailable.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-rule-strong px-6 py-10 text-center text-[14px] text-ink-2">
            This wallet owns no agents yet.{' '}
            <Link href="/build/new" className="font-medium text-ink underline-offset-2 hover:underline">
              Create your first agent
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
        <BuilderAlerts />
        <DraftsList />
      </div>

      <p className="t-readout mt-12 text-[12px] leading-relaxed text-ink-3">
        Earnings are $U released to this wallet on {chainLabel(56)}. Test tokens on {chainLabel(97)} are shown beside them and never counted. Jobs are those funded through Pokter.
      </p>
    </>
  );
}
