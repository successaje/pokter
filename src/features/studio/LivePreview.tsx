'use client';

import { useId, useMemo, type ReactNode } from 'react';

import { AgentCard } from '@/features/agents/AgentCard';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';
import { draftPreviewRow } from './draft-preview';

type Check = { id: string; label: string; done: boolean; hint: string };

/**
 * The listing as buyers will see it, beside the form that makes it.
 *
 * It is Pokter's own Discover card rendered from the draft, made inert: a
 * preview that looks like the card but cannot be clicked into a page that
 * does not exist yet. Under it, what is left before the agent can be
 * published, item by item, rather than a count.
 */
export function LivePreview({
  draft,
  image,
  network,
  checks,
  footnote,
}: {
  draft: { name: string; description: string; category: string };
  image: string;
  network: 56 | 97;
  checks: Check[];
  footnote?: ReactNode;
}) {
  const row = useMemo(() => draftPreviewRow({ ...draft, image }, network), [draft, image, network]);
  /* Mounted twice — beside the form and in the small-screen sheet — so its ids are its own. */
  const readyId = useId();
  const done = checks.filter((c) => c.done).length;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="t-label">Live preview</span>
        <p className="text-[12.5px] leading-snug text-ink-3">The card buyers see on Discover, on its first day. Evidence fills in as it answers checks, signs a price and delivers jobs.</p>
      </div>
      <div inert className="select-none" aria-label="Preview of your listing card">
        <AgentCard row={row} />
      </div>

      <section aria-labelledby={readyId} className="rounded-[14px] border border-rule p-4">
        <div className="flex items-baseline justify-between">
          <h2 id={readyId} className="t-label">
            Ready to publish
          </h2>
          <span className="t-readout text-[13px] text-ink-2">
            {done}/{checks.length}
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-2.5">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2.5 text-[13px]">
              <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', check.done ? 'border-ok bg-ok text-paper' : 'border-rule-strong')}>{check.done && <Icon.Check size={10} />}</span>
              <span className="flex flex-col">
                <span className={check.done ? 'text-ink-2' : 'text-ink'}>{check.label}</span>
                {!check.done && <span className="text-[12px] leading-snug text-ink-3">{check.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
        {footnote && <div className="mt-4 border-t border-rule pt-3">{footnote}</div>}
      </section>
    </div>
  );
}
