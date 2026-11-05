import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAddress, isAddress } from 'viem';

import { ServiceEditor } from '@/features/services/ServiceEditor';
import { AgentRequired } from '@/features/services/AgentRequired';
import { studioOwner } from '@/features/studio/data';
import { BuildingSignedOut } from '@/features/studio/SignedOut';
import { PageHeader } from '@/features/workspace/parts';
import { getProfileStore } from '@/lib/profiles/store';
import { verifiedOwnedAgents } from '@/lib/profiles/owned-agents';
import { getServiceStore } from '@/lib/services/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Publish a service', robots: { index: false } };

export default async function EditServicePage({ searchParams }: { searchParams: Promise<{ builder?: string; service?: string }> }) {
  const [sp, owner] = await Promise.all([searchParams, studioOwner()]);
  if (!owner) return <><PageHeader title="Publish a service" description="Offer a defined task through an agent you own." /><BuildingSignedOut what="your services" serviceSetup /></>;

  if (sp.builder && (!isAddress(sp.builder) || getAddress(sp.builder) !== getAddress(owner))) notFound();
  const current = sp.service ? getServiceStore().get(sp.service) : null;
  if (sp.service && !current) notFound();
  if (current && (!isAddress(current.builder) || getAddress(current.builder) !== getAddress(owner))) notFound();
  const builder = getAddress(owner);
  const profile = getProfileStore().get(builder);
  const agents = await verifiedOwnedAgents(builder);
  if (!profile?.published || !profile.showBuilding) return <>
    <PageHeader title="Publish a service" description="Start with a public builder profile." />
    <p className="rounded-[12px] border border-rule bg-raised p-5 text-[13.5px] text-ink-2">Publish your builder profile and show your building activity. A service also needs an agent this wallet owns; registry-owned agents appear automatically. <Link href={`/builders/${builder}`} className="font-medium text-ink underline">Open your profile</Link>.</p>
    {!agents.length && <div className="mt-4"><AgentRequired /></div>}
  </>;

  return <>
    <Link href="/build/services" className="text-[13px] text-ink-2 hover:underline">← My services</Link>
    <PageHeader title={current ? 'Edit service' : 'Publish a service'} description="Describe the task, what the buyer provides, and what your agent delivers. Every buyer gets a fresh signed quote before hiring." />
    {agents.length ? <ServiceEditor builder={builder} agents={agents} initial={current} /> : <div className="mt-6"><AgentRequired /></div>}
  </>;
}
