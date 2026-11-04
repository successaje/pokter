import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAddress, isAddress } from 'viem';

import { ServiceEditor } from '@/features/services/ServiceEditor';
import { studioOwner } from '@/features/studio/data';
import { BuildingSignedOut } from '@/features/studio/SignedOut';
import { PageHeader } from '@/features/workspace/parts';
import { getProfileStore } from '@/lib/profiles/store';
import { registryOwner } from '@/lib/registry/onchain';
import { getServiceStore } from '@/lib/services/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Publish a service', robots: { index: false } };

export default async function EditServicePage({ searchParams }: { searchParams: Promise<{ builder?: string; service?: string }> }) {
  const [sp, owner] = await Promise.all([searchParams, studioOwner()]);
  if (!owner) return <><PageHeader title="Publish a service" description="Offer a defined task through an agent you own." /><BuildingSignedOut what="your services" /></>;

  if (sp.builder && (!isAddress(sp.builder) || getAddress(sp.builder) !== getAddress(owner))) notFound();
  const current = sp.service ? getServiceStore().get(sp.service) : null;
  if (sp.service && !current) notFound();
  if (current && (!isAddress(current.builder) || getAddress(current.builder) !== getAddress(owner))) notFound();
  const builder = getAddress(owner);
  const profile = getProfileStore().get(builder);
  if (!profile?.published || !profile.showBuilding) return <>
    <PageHeader title="Publish a service" description="Start with a public builder profile." />
    <p className="rounded-[12px] border border-rule bg-raised p-5 text-[13.5px] text-ink-2">Publish your builder profile, show your building activity, and select an agent you own. <Link href={`/builders/${builder}`} className="font-medium text-ink underline">Open your profile</Link>.</p>
  </>;

  const checks = await Promise.all(profile.agents.map(async (key) => {
    const [chain, token] = key.split(':');
    return registryOwner(Number(chain), token).catch(() => null);
  }));
  const agents = profile.agents.filter((_, i) => checks[i] === builder).map((key) => ({ key, name: `Agent #${key.split(':')[1]}` }));

  return <>
    <Link href="/build/services" className="text-[13px] text-ink-2 hover:underline">← My services</Link>
    <PageHeader title={current ? 'Edit service' : 'Publish a service'} description="Describe the task, what the buyer provides, and what your agent delivers. Every buyer gets a fresh signed quote before hiring." />
    {agents.length ? <ServiceEditor builder={builder} agents={agents} initial={current} /> : <p className="mt-6 rounded-[12px] border border-rule bg-raised p-5 text-[13.5px] text-ink-2">No agent on this profile is currently verified as owned by your wallet. <Link href={`/builders/${builder}`} className="font-medium text-ink underline">Edit your profile</Link> or retry when the registry is available.</p>}
  </>;
}
