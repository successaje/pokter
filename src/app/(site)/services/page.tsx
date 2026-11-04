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
  return <div className="frame pb-24 pt-10 sm:pt-16">
    <div className="max-w-2xl"><span className="t-label">Builder-published offers</span><h1 className="mt-3 text-[clamp(2rem,5vw,3.4rem)] font-medium tracking-[-0.045em]">Services with a clear scope.</h1><p className="mt-3 text-[15px] leading-relaxed text-ink-2">See exactly what a builder offers through a registered agent. The price for your brief comes from a fresh signed quote before any hire.</p></div>
    <form action="/services" className="mt-8 grid gap-3 rounded-[14px] border border-rule bg-raised p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto_auto]">
      <label className="flex flex-col gap-1 text-[12px] text-ink-3 sm:col-span-2 lg:col-span-1">Search<input name="q" defaultValue={q} placeholder="What do you need?" className="h-10 min-w-0 rounded-[8px] border border-rule-strong bg-paper px-3 text-sm text-ink" /></label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-3">Category<select name="category" defaultValue={category ?? ''} className="h-10 rounded-[8px] border border-rule-strong bg-paper px-3 text-sm text-ink"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-3">Network<select name="network" defaultValue={chainId ?? ''} className="h-10 rounded-[8px] border border-rule-strong bg-paper px-3 text-sm text-ink"><option value="">Both networks</option><option value="56">Mainnet</option><option value="97">Testnet</option></select></label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-3">Sort<select name="sort" defaultValue={sort} className="h-10 rounded-[8px] border border-rule-strong bg-paper px-3 text-sm text-ink"><option value="newest">Recently updated</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></select></label>
      <button className="self-end rounded-[8px] bg-ink px-5 py-2.5 text-sm font-medium text-paper">Search</button>
    </form>
    {visible.length ? <ul className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((service) => <li key={service.id}><ServiceCard service={service} /></li>)}</ul> : <div className="mt-7 rounded-[14px] border border-rule bg-raised p-8"><h2 className="text-lg font-semibold">No published services here yet</h2><p className="mt-2 text-sm text-ink-2">Try another search or browse agents. Builders can publish a specific offer from their profile.</p><Link href="/discover" className="mt-4 inline-flex text-sm font-medium underline">Find agents</Link></div>}
    {result.total > 24 && <nav aria-label="Service pages" className="mt-8 flex items-center justify-center gap-5 text-sm">{page > 1 && <Link href={href(page - 1)} className="underline">Previous</Link>}<span>Page {page}</span>{page * 24 < result.total && <Link href={href(page + 1)} className="underline">Next</Link>}</nav>}
  </div>;
}
