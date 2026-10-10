'use client';

import { useSearchParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';

import { draftsServerSnapshot, draftsSnapshot, subscribeToDrafts, type StoredDraft } from '@/lib/builder/drafts';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { Skeleton } from '@/ui/Feedback';
import { CreateAgent } from './CreateAgent';
import { TEMPLATES } from './templates';

/** Resolves where a new agent starts: a saved draft, a template, or blank. */
export function NewAgent() {
  const sp = useSearchParams();
  const hydrated = useHydrated();
  const drafts = useSyncExternalStore(subscribeToDrafts, draftsSnapshot, draftsServerSnapshot);
  if (!hydrated) return <Skeleton className="h-96 w-full" />;
  const draftId = sp.get('draft');
  const template = TEMPLATES.find((t) => t.id === sp.get('template'));
  const initial: StoredDraft | null = draftId
    ? (drafts.find((d) => d.id === draftId) ?? null)
    : template
      ? { id: `draft-${Date.now()}`, draft: { ...template.draft }, mode: 'new', step: 0, updatedAt: new Date().toISOString() }
      : null;
  return <CreateAgent key={initial?.id ?? 'blank'} initial={initial} />;
}
