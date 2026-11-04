import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { sampleServices } from '@/features/services/preview';
import { CATEGORIES } from '@/lib/agents/categories';

export const metadata: Metadata = { title: 'Sample service preview', robots: { index: false } };

export default async function SampleServicePage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { id } = await params;
  const service = sampleServices.find((item) => item.id === id);
  if (!service) notFound();
  const category = CATEGORIES.find((item) => item.id === service.category)?.label ?? 'General';

  return <div className="frame pb-24 pt-8 sm:pt-12">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-watch/30 bg-watch/10 px-4 py-3 text-[13px]"><span><strong>Local preview</strong> · This sample is not published and cannot be hired.</span><Link href="/services" className="font-medium underline">View real services</Link></div>
    <Link href="/services?preview=1" className="text-[13px] text-ink-2 hover:underline">← Sample services</Link>
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)]">
      <main className="min-w-0">
        <div className="flex flex-wrap gap-2 text-xs text-ink-3"><span className="rounded-full border border-rule-strong px-2.5 py-1">{category}</span><span className="rounded-full border border-rule-strong px-2.5 py-1">BNB {service.chainId === 56 ? 'Mainnet' : 'Testnet'}</span><span className="rounded-full border border-rule-strong px-2.5 py-1">Sample offer</span></div>
        <h1 className="mt-5 break-words text-[clamp(2rem,4vw,3rem)] font-medium leading-tight tracking-[-0.04em]">{service.title}</h1>
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{service.description}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-[12px] border border-rule p-5"><h2 className="t-label">You provide</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{service.buyerProvides}</p></div><div className="rounded-[12px] border border-rule p-5"><h2 className="t-label">You get back</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{service.delivers}</p></div></div>
      </main>
      <aside className="rounded-[14px] border border-rule bg-raised p-5"><span className="t-label">Who does the work</span><p className="mt-3 text-sm font-semibold">Sample builder → Sample agent</p><p className="mt-3 text-xs leading-relaxed text-ink-3">No registry ownership, quote, or delivery evidence is attached to this sample. A real buyer would review those before hiring.</p><div className="mt-6 rounded-[9px] border border-rule-strong bg-paper p-4 text-sm text-ink-2">Preview only · hiring is unavailable</div><Link href="/build/services/preview/new" className="mt-4 inline-flex text-[13px] font-medium underline">See the service editor</Link></aside>
    </div>
  </div>;
}
