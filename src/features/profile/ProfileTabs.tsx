'use client';

import { useSearchParams } from 'next/navigation';
import { type MouseEvent, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

type Panel = { id: string; label: string; ariaLabel?: string; content: ReactNode };
type Section = { id: 'building' | 'hiring'; panels: Panel[] };

/** The public content is rendered once; changing tabs only changes the URL and visible panel. */
export function ProfileTabs({ base, sections, defaultView }: { base: string; sections: Section[]; defaultView: Section['id'] }) {
  const params = useSearchParams();
  const section = sections.find((item) => item.id === params.get('view')) ?? sections.find((item) => item.id === defaultView) ?? sections[0];
  const panel = section.panels.find((item) => item.id === params.get('tab')) ?? section.panels[0];

  function href(view: Section['id'], tab: string) {
    const next = new URLSearchParams(params.toString());
    next.set('view', view);
    next.set('tab', tab);
    return `${base}?${next.toString()}`;
  }

  function select(event: MouseEvent<HTMLAnchorElement>, destination: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, '', destination);
  }

  return <section aria-label="Profile content" className="min-w-0">
    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-rule">
      <nav aria-label={sections.length === 1 && section.panels.some((item) => item.id === 'evidence') ? 'Builder profile sections' : `${section.id === 'building' ? 'Building' : 'Hiring'} tabs`} className="-mx-3 flex min-w-0 max-w-full gap-1 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {section.panels.map((item) => <a key={item.id} href={href(section.id, item.id)} onClick={(event) => select(event, href(section.id, item.id))} aria-label={item.ariaLabel} aria-current={panel.id === item.id ? 'page' : undefined} className={cn('-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13.5px] font-medium', panel.id === item.id ? 'border-[#e5a900] text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>{item.label}</a>)}
      </nav>
      {sections.length > 1 && <nav aria-label="Profile section" className="mb-1 inline-flex w-fit rounded-[10px] bg-sunken p-1">
        {sections.map((item) => <a key={item.id} href={href(item.id, item.panels[0].id)} onClick={(event) => select(event, href(item.id, item.panels[0].id))} aria-current={section.id === item.id ? 'page' : undefined} className={cn('rounded-[7px] px-3 py-1 text-[12.5px] font-medium', section.id === item.id ? 'bg-raised text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}>{item.id === 'building' ? 'Building' : 'Hiring'}</a>)}
      </nav>}
    </div>
    <div className="pt-4 lg:min-h-56" aria-live="polite">{panel.content}</div>
  </section>;
}
