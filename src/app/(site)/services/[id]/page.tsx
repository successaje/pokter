import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServiceStore } from '@/lib/services/store';
import { registryOwner } from '@/lib/registry/onchain';
import { CATEGORIES } from '@/lib/agents/categories';
import { ServiceStart } from '@/features/services/ServiceStart';
import { ServiceOwnerAction } from '@/features/services/ServiceOwnerAction';
import { loadProfile } from '@/features/agent/profile';
import { getProfileStore } from '@/lib/profiles/store';
import { NetworkStageTag } from '@/ui/Network';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const service = getServiceStore().get((await params).id);
  return { title: service?.title ?? 'Service', description: service?.description };
}
export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const service = getServiceStore().get((await params).id);
  if (!service) notFound();
  const owner = await registryOwner(service.chainId, service.tokenId).catch(() => null);
  const agent = owner?.toLowerCase() === service.builder.toLowerCase() ? await loadProfile(service.chainId, service.tokenId).catch(() => null) : null;
  const available = service.status === 'active' && agent?.state === 'ok' && agent.profile.hireable;
  const category = CATEGORIES.find((c) => c.id === service.category)?.label ?? 'General';
  const builderProfile = getProfileStore().get(service.builder);
  const builderName = builderProfile?.published ? builderProfile.displayName || `@${builderProfile.handle}` : `Builder ${service.builder.slice(0, 6)}…${service.builder.slice(-4)}`;
  return <div className="frame pb-24 pt-10 sm:pt-14">
    <Link href="/services" className="text-[13px] text-ink-2 hover:underline">← All services</Link>
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)]">
      <main className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-xs text-ink-3"><span className="rounded-full border border-rule-strong px-2.5 py-1">{category}</span><NetworkStageTag chainId={service.chainId} /><span className="rounded-full border border-rule-strong px-2.5 py-1">Builder-published</span></div>
        <h1 className="mt-5 break-words text-[clamp(2rem,4vw,3rem)] font-medium leading-tight tracking-[-0.04em]">{service.title}</h1>
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{service.description}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-[12px] border border-rule p-5"><h2 className="t-label">You provide</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{service.buyerProvides}</p></div><div className="rounded-[12px] border border-rule p-5"><h2 className="t-label">You get back</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{service.delivers}</p></div></div>
        <p className="mt-5 text-xs text-ink-3">Published scope revision {service.revision} · Updated {new Date(service.updatedAt).toLocaleDateString('en-GB')}. This is the builder&apos;s claim. Review the agent&apos;s Pokter-observed evidence separately.</p>
      </main>
      <aside className="flex flex-col gap-5"><div className="rounded-[14px] border border-rule bg-raised p-5"><span className="t-label">Who does the work</span><div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><Link href={`/builders/${service.builder}`} className="font-semibold underline underline-offset-2">{builderName}</Link><span aria-hidden className="text-ink-3">→</span><Link href={`/agents/${service.chainId}/${service.tokenId}`} className="font-semibold underline underline-offset-2">{agent?.state === 'ok' ? agent.profile.name : `Agent #${service.tokenId}`}</Link></div><p className="mt-3 text-xs leading-relaxed text-ink-3">{available ? 'Registry ownership and current hireability checked.' : owner ? 'This agent is unavailable for a hire now, the offer is paused, or ownership changed.' : 'Registry check unavailable. Hiring is paused here.'} Price is set by a fresh signed quote for your actual brief.</p></div>
        <ServiceOwnerAction builder={service.builder} serviceId={service.id} />
        {available ? <ServiceStart service={service} /> : <div className="rounded-[14px] border border-rule bg-raised p-5 text-sm text-ink-2">This offer is unavailable. You can still review the agent, but this service cannot start a hire now.</div>}
      </aside>
    </div>
  </div>;
}
