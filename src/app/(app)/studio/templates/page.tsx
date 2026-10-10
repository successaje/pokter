import type { Metadata } from 'next';
import Link from 'next/link';

import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { PageHeader } from '@/features/workspace/parts';
import { TEMPLATES } from '@/features/studio/templates';
import { Icon } from '@/ui/icons';

export const metadata: Metadata = { title: 'Agent templates' };

export default function Page() {
  return (
    <>
      <PageHeader label="Builder Studio" title="Start from a template" description="Each one is a written starting point: a name, a description and a category that buyers already search for. You still bring the endpoint that does the work." />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <Link href={`/studio/new?template=${t.id}`} className="group flex h-full flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5 transition-colors hover:border-rule-strong">
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
          </li>
        ))}
      </ul>
    </>
  );
}
