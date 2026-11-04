import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/features/workspace/parts';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

import { sampleService } from './sample';

export const metadata: Metadata = { title: 'My services preview', robots: { index: false } };

export default function ServicePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-watch/30 bg-watch/10 px-4 py-3 text-[13px]">
      <span><strong>Local preview</strong> · This sample is not published and cannot be hired.</span>
      <Link href="/build/services" className="font-medium underline">Return to your services</Link>
    </div>
    <PageHeader title="My services" description="Offer a defined task through an agent you own. Buyers request a fresh quote before hiring." action={<LinkButton href="/build/services/preview/new" size="s" icon={<Icon.Plus size={14} />}>Publish service</LinkButton>} />
    <section aria-labelledby="preview-offers-title">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="preview-offers-title" className="text-[18px] font-semibold">Your offers</h2><span className="text-[12.5px] text-ink-3">1 sample</span></div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <li className="flex flex-col rounded-[14px] border border-rule bg-raised p-5">
          <div className="flex items-start justify-between gap-3"><h3 className="text-[16px] font-semibold leading-snug">{sampleService.title}</h3><span className="shrink-0 rounded-full border border-rule-strong px-2 py-0.5 text-[11px] text-ink-2">Sample</span></div>
          <p className="mt-2 line-clamp-3 text-[13px] text-ink-2">{sampleService.description}</p>
          <p className="mt-3 text-[12px] text-ink-3">Sample agent · BNB Testnet</p>
          <div className="mt-auto border-t border-rule pt-3 text-[13px] font-medium"><Link href="/build/services/preview/new" className="hover:underline">Explore the editor →</Link></div>
        </li>
      </ul>
    </section>
  </>;
}
