import Link from 'next/link';
import { getAddress, isAddress } from 'viem';
import { notFound } from 'next/navigation';
import { getProfileStore } from '@/lib/profiles/store';
import { getServiceStore } from '@/lib/services/store';
import { registryOwner } from '@/lib/registry/onchain';
import { ServiceEditor } from '@/features/services/ServiceEditor';

export const dynamic = 'force-dynamic';
export default async function EditServicePage({ searchParams }: { searchParams: Promise<{ builder?: string; service?: string }> }) {
  const sp = await searchParams;
  const current = sp.service ? getServiceStore().get(sp.service) : null;
  const wallet = current?.builder ?? sp.builder;
  if (!wallet || !isAddress(wallet)) notFound();
  const builder = getAddress(wallet);
  const profile = getProfileStore().get(builder);
  if (!profile?.published || !profile.showBuilding) notFound();
  const checks = await Promise.all(profile.agents.map(async (key) => { const [chain, token] = key.split(':'); return registryOwner(Number(chain), token).catch(() => null); }));
  const agents = profile.agents.filter((_, i) => checks[i] === builder).map((key) => ({ key, name: `Agent #${key.split(':')[1]}` }));
  return <div className="frame pb-24 pt-10"><Link href={`/builders/${builder}`} className="text-sm text-ink-2 hover:underline">← Builder profile</Link><h1 className="mt-5 text-3xl font-semibold">{current ? 'Edit service' : 'Publish a service'}</h1><p className="mt-2 max-w-xl text-sm text-ink-2">Describe a specific offer backed by an agent you own. A buyer will still review an exact brief and request a fresh signed quote.</p>{agents.length ? <ServiceEditor builder={builder} agents={agents} initial={current} /> : <p className="mt-8 rounded-[12px] border border-rule p-5 text-sm">No agents on this published profile are currently owned by this wallet. Add a verified agent before publishing a service.</p>}</div>;
}
