import type { Metadata } from 'next';
import Link from 'next/link';

import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { flagshipPlaybook } from '@/lib/agents/flagship-playbooks';
import { PageHeader } from '@/features/workspace/parts';
import { TEMPLATES } from '@/features/studio/templates';
import { Icon } from '@/ui/icons';

// Personal or step-by-step builder pages: kept out of search, as they were under Studio.
export const metadata: Metadata = { title: 'Agent templates', robots: { index: false } };

export default function Page() {
  return (
    <>
      <PageHeader title="Start from a template" description="Choose a buyer task, then make an endpoint that can answer it. A profile alone cannot be hired; the checklist below takes you from a draft to a working agent." />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TEMPLATES.map((t) => (
          <li key={t.id} className="flex flex-col gap-2">
            <Link href={`/build/new/guided?template=${t.id}`} className="group flex h-full flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5 transition-colors hover:border-rule-strong">
              <span className="flex items-center justify-between">
                <span className="t-label">{CATEGORY_BY_ID.get(t.draft.category as Category)?.label}</span>
                <span className="t-readout text-[11px] text-ink-3">{t.draft.protocol.toUpperCase()}</span>
              </span>
              <span className="text-lg font-semibold tracking-[-0.015em]">{t.title}</span>
              <span className="text-[13.5px] text-ink-2">{t.summary}</span>
              <span className="text-[12.5px] text-ink-3">Returns: {t.returns}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-2 text-[13px] font-medium">
                Use this template <Icon.Arrow size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
            {flagshipPlaybook(t.draft.category) && (
              <Link href={`/task-guides/${t.draft.category}`} className="inline-flex items-center gap-1.5 self-start px-1 text-[12.5px] font-medium text-ink-2 hover:text-ink hover:underline">
                See the buyer brief and delivery checks <Icon.Arrow size={12} />
              </Link>
            )}
          </li>
        ))}
      </ul>
      <section className="mt-10 border-t border-rule pt-8" aria-labelledby="runtime-steps-title">
        <span className="t-label">From draft to hireable</span>
        <h2 id="runtime-steps-title" className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">Build, test, then list</h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            { title: '1. Build the endpoint', detail: 'Make a service that answers a real task and exposes its A2A card. The template gives you truthful listing copy, not a runtime.', href: '/build/integration#transports', action: 'Read the protocol guide' },
            { title: '2. Check it privately', detail: 'Run a live compatibility check on the endpoint and fix the first blocker before registration.', href: '/build/import', action: 'Test an endpoint' },
            { title: '3. Publish and price', detail: 'Register the identity you own, sign a quote from its wallet and verify that Pokter can hire and receive its work.', href: '/build/integration#preflight', action: 'Read the hireability checklist' },
          ].map((step) => (
            <li key={step.title} className="rounded-[12px] border border-rule bg-raised p-5">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{step.detail}</p>
              <Link href={step.href} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline">{step.action} <Icon.Arrow size={13} /></Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
