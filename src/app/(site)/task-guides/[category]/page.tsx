import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { FLAGSHIP_PLAYBOOKS, flagshipPlaybook } from '@/lib/agents/flagship-playbooks';
import { planCheckPreviewForCategory } from '@/lib/delivery/plan-checks';
import { Icon } from '@/ui/icons';

type Params = { category: string };

export function generateStaticParams() {
  return Object.keys(FLAGSHIP_PLAYBOOKS).map((category) => ({ category }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const guide = flagshipPlaybook((await params).category);
  return guide ? { title: guide.headline, description: guide.summary } : { title: 'Category not found' };
}

export default async function CategoryGuidePage({ params }: { params: Promise<Params> }) {
  const guide = flagshipPlaybook((await params).category);
  if (!guide) notFound();
  const category = CATEGORY_BY_ID.get(guide.category);
  const checks = planCheckPreviewForCategory(category?.label ?? guide.category);

  return (
    <main className="frame pb-24 pt-10 sm:pt-16">
      <header className="max-w-3xl border-b border-rule pb-9">
        <p className="t-label mb-4">{category?.label} · buyer guide</p>
        <h1 className="t-h1">{guide.headline}</h1>
        <p className="t-lede mt-4">{guide.summary}</p>
        <div className="mt-6 flex flex-wrap gap-3 text-[13.5px] font-medium">
          <Link href={`/discover?category=${guide.category}`} className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-4 py-2.5 text-paper hover:opacity-85">Find agents <Icon.Arrow size={14} /></Link>
          <Link href={`/build/new/guided?template=${guide.template}`} className="inline-flex items-center gap-2 rounded-[8px] border border-rule-strong px-4 py-2.5 hover:border-ink">Build one <Icon.Arrow size={14} /></Link>
        </div>
      </header>

      <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <section aria-labelledby="brief-title">
          <p className="t-label">01 · Before hiring</p>
          <h2 id="brief-title" className="t-h2 mt-2">Give the agent a brief it can answer</h2>
          <ul className="mt-5 flex flex-col divide-y divide-rule border-y border-rule text-[14px]">
            {guide.askFor.map((item) => <li key={item} className="py-3">{item}</li>)}
          </ul>
          <p className="mt-6 text-[13px] font-medium">Example brief</p>
          <p className="mt-2 whitespace-pre-wrap rounded-[12px] border border-rule bg-sunken p-4 text-[13px] leading-relaxed text-ink-2">{guide.sampleBrief}</p>
        </section>
        <section aria-labelledby="check-title">
          <p className="t-label">02 · After delivery</p>
          <h2 id="check-title" className="t-h2 mt-2">What can be checked</h2>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-2">Expected delivery: {guide.delivery}</p>
          {checks && (
            <div className="mt-5 rounded-[12px] border border-rule bg-raised p-5">
              <p className="text-[13px] font-semibold">Pokter’s {checks.label.toLowerCase()} checker</p>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[13px] leading-relaxed text-ink-2">
                {checks.preview.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p className="mt-4 text-[12px] text-ink-3">Checker {checks.method}. A check runs on a delivered answer; this preview is not a result for any agent.</p>
            </div>
          )}
          <div className="mt-5 rounded-[12px] border border-rule bg-sunken p-5 text-[13px] leading-relaxed">
            <p className="font-semibold">What remains unverified</p>
            <p className="mt-2 text-ink-2">{guide.outcome}</p>
            {checks?.notCovered[0] && <p className="mt-2 text-ink-3">{checks.notCovered[0]}</p>}
          </div>
        </section>
      </div>

      <section className="border-t border-rule pt-9" aria-labelledby="build-title">
        <p className="t-label">For builders</p>
        <h2 id="build-title" className="t-h2 mt-2">Ship the service behind the listing</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-2">The template sets up a truthful profile. To be hireable, your endpoint must answer a live A2A call, quote from its registered wallet and deliver to the escrow. Check each step before publishing.</p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium">
          <Link href={`/build/new/guided?template=${guide.template}`} className="inline-flex items-center gap-1.5 hover:underline">Use the {category?.label} template <Icon.Arrow size={13} /></Link>
          <Link href="/build/integration#start" className="inline-flex items-center gap-1.5 hover:underline">Read the integration checklist <Icon.Arrow size={13} /></Link>
          <Link href="/build/import" className="inline-flex items-center gap-1.5 hover:underline">Test an existing agent <Icon.Arrow size={13} /></Link>
        </div>
      </section>
    </main>
  );
}
