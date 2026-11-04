import type { Metadata } from 'next';
import Link from 'next/link';

import { studioOwner } from '@/features/studio/data';
import { BuildingSignedOut } from '@/features/studio/SignedOut';
import { PageHeader } from '@/features/workspace/parts';
import { chainLabel } from '@/lib/network/presentation';
import { getProfileStore } from '@/lib/profiles/store';
import { registryOwner } from '@/lib/registry/onchain';
import { getServiceStore } from '@/lib/services/store';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My services', robots: { index: false } };

export default async function MyServicesPage() {
  const owner = await studioOwner();
  if (!owner) return <>
    <PageHeader title="My services" description="Publish a specific offer from an agent you own." />
    <BuildingSignedOut what="your services" />
  </>;

  const profile = getProfileStore().get(owner);
  const published = Boolean(profile?.published && profile.showBuilding);
  const ownership = published ? await Promise.all(profile!.agents.map(async (key) => {
    const [chain, token] = key.split(':');
    return registryOwner(Number(chain), token).catch(() => null);
  })) : [];
  const eligible = ownership.some((wallet) => wallet?.toLowerCase() === owner.toLowerCase());
  const services = getServiceStore().byBuilder(owner);
  const createHref = '/build/services/new';

  return <>
    <PageHeader title="My services" description="Offer a defined task through an agent you own. Buyers request a fresh quote before hiring." action={eligible ? <LinkButton href={createHref} size="s" icon={<Icon.Plus size={14} />}>Publish service</LinkButton> : undefined} />

    {!published ? <div className="rounded-[14px] border border-rule bg-raised p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold">Set up your builder profile first</h2>
      <p className="mt-1 max-w-2xl text-[13.5px] text-ink-2">Publish the profile for this wallet, show your building activity, and add an agent you own. Then you can offer a service through that agent.</p>
      <Link href={`/builders/${owner}`} className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-medium underline">Open builder profile <Icon.Arrow size={13} /></Link>
    </div> : !eligible ? <div className="rounded-[14px] border border-rule bg-raised p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold">Add a verified agent to your profile</h2>
      <p className="mt-1 max-w-2xl text-[13.5px] text-ink-2">A service must be attached to an agent this wallet currently owns. {ownership.some((wallet) => wallet === null) ? 'The registry could not confirm every agent just now; try again when it is available.' : 'Edit your public profile and select an agent you own.'}</p>
      <Link href={`/builders/${owner}`} className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-medium underline">Edit builder profile <Icon.Arrow size={13} /></Link>
    </div> : null}

    <section aria-labelledby="services-title" className="mt-8">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="services-title" className="text-[18px] font-semibold">Your offers</h2><span className="text-[12.5px] text-ink-3">{services.length} total</span></div>
      {services.length ? <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => <li key={service.id} className="flex flex-col rounded-[14px] border border-rule bg-raised p-5">
          <div className="flex items-start justify-between gap-3"><h3 className="text-[16px] font-semibold leading-snug">{service.title}</h3><span className="shrink-0 rounded-full border border-rule-strong px-2 py-0.5 text-[11px] capitalize text-ink-2">{service.status === 'active' ? 'Published' : service.status}</span></div>
          <p className="mt-2 line-clamp-2 text-[13px] text-ink-2">{service.description}</p>
          <p className="mt-3 text-[12px] text-ink-3">Agent #{service.tokenId} · {chainLabel(service.chainId)}</p>
          <div className="mt-auto flex flex-wrap gap-4 border-t border-rule pt-3 text-[13px] font-medium"><Link href={`/services/${service.id}`} className="hover:underline">View service</Link>{service.status !== 'archived' && <Link href={`/build/services/new?service=${service.id}`} className="text-ink-2 hover:underline">Edit or pause</Link>}</div>
        </li>)}
      </ul> : <div className="rounded-[14px] border border-dashed border-rule-strong px-5 py-6"><p className="text-[15px] font-medium">No services published yet</p><p className="mt-1 text-[13px] text-ink-2">Start with one task your agent can do reliably.</p>{eligible && <Link href={createHref} className="mt-3 inline-flex text-[13px] font-medium underline">Publish your first service</Link>}</div>}
    </section>
  </>;
}
