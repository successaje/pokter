import type { Metadata } from 'next';
import Link from 'next/link';
import { CATEGORIES } from '@/lib/agents/categories';
import { registryOwner } from '@/lib/registry/onchain';
import { getServiceStore } from '@/lib/services/store';
import { ServiceCard } from '@/features/services/ServiceCard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Services', description: 'Specific offers published by BNB Chain agent builders. Review scope, agent evidence and a fresh quote before hiring.' };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const category = CATEGORIES.some((c) => c.id === sp.category) ? sp.category : undefined;
  const chainId = sp.network === '56' ? 56 : sp.network === '97' ? 97 : undefined;
  const sort = sp.sort === 'oldest' || sp.sort === 'title' ? sp.sort : 'newest';
  const page = Math.max(1, Math.min(100, Number(sp.page) || 1));
  const result = getServiceStore().list({ q, category, chainId, sort, limit: 24, offset: (page - 1) * 24 });
  const checks = await Promise.all(result.items.map((service) => registryOwner(service.chainId, service.tokenId).catch(() => null)));
  const visible = result.items.filter((service, i) => checks[i]?.toLowerCase() === service.builder.toLowerCase());
  const href = (next: number) => `/services?${new URLSearchParams(Object.entries({ q, category: category ?? '', network: chainId ? String(chainId) : '', sort, page: String(next) }).filter(([, v]) => Boolean(v))).toString()}`;
  const filtered = Boolean(q || category || chainId);
  return <div className="frame pb-24 pt-8 sm:pt-12">
    <div className="max-w-2xl"><span className="t-label">Builder-published offers</span><h1 className="mt-2 text-[clamp(2rem,5vw,3.2rem)] font-semibold tracking-[-0.045em]">Find a service.</h1><p className="mt-2 text-[14px] leading-relaxed text-ink-2">Choose a specific offer. Review the agent and a fresh price before you hire.</p></div>
    <form action="/services" className="mt-7 rounded-[14px] border border-rule bg-raised p-4">
      <div className="flex flex-col gap-2 sm:flex-row"><label htmlFor="service-search" className="sr-only">Search services</label><input id="service-search" name="q" defaultValue={q} placeholder="Search by task, agent or outcome" className="h-11 min-w-0 flex-1 rounded-[8px] border border-rule-strong bg-paper px-3 text-sm text-ink" /><button className="h-11 rounded-[8px] bg-ink px-6 text-sm font-medium text-paper">Search</button></div>
      <details className="group mt-3" open={Boolean(category || chainId || sort !== 'newest')}><summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-[12.5px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">Filters{(category || chainId) && ' active'} <span className="transition-transform group-open:rotate-180" aria-hidden>⌄</span></summary>
        <div className="mt-3 grid gap-3 border-t border-rule pt-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">Category<select name="category" defaultValue={category ?? ''} className="h-10 rounded-[8px] border border-rule-strong bg-paper px-3 text-sm text-ink"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">Network<select name="network" defaultValue={chainId ?? ''} className="h-10 rounded-[8px] border border-rule-strong bg-paper px-3 text-sm text-ink"><option value="">Both networks</option><option value="56">Mainnet</option><option value="97">Testnet</option></select></label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">Sort<select name="sort" defaultValue={sort} className="h-10 rounded-[8px] border border-rule-strong bg-paper px-3 text-sm text-ink"><option value="newest">Recently updated</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></select></label>
        </div>
      </details>
    </form>
    {visible.length ? <><p className="mt-6 text-[12.5px] text-ink-3">{visible.length} {visible.length === 1 ? 'service' : 'services'} shown</p><ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((service) => <li key={service.id}><ServiceCard service={service} /></li>)}</ul></> : <div className="mt-6 rounded-[14px] border border-rule bg-raised p-6 sm:p-8"><h2 className="text-lg font-semibold">{filtered ? 'No services match your search' : 'No services published yet'}</h2><p className="mt-1 text-sm text-ink-2">{filtered ? 'Try a broader search or clear the filters.' : 'Builders can publish a defined offer from an agent they own. Until then, explore agents and request custom work from a claimed builder.'}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2"><Link href={filtered ? '/services' : '/discover'} className="text-sm font-medium underline">{filtered ? 'Clear filters' : 'Explore agents'}</Link>{!filtered && <Link href="/workspace/services/new" className="text-sm font-medium text-ink-2 underline">Publish a service</Link>}</div></div>}
    {result.total > 24 && <nav aria-label="Service pages" className="mt-8 flex items-center justify-center gap-5 text-sm">{page > 1 && <Link href={href(page - 1)} className="underline">Previous</Link>}<span>Page {page}</span>{page * 24 < result.total && <Link href={href(page + 1)} className="underline">Next</Link>}</nav>}
  </div>;
}
