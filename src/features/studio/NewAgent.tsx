'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';

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
  const [startedAt] = useState(() => Date.now());
  /*
   * The form's own draft id, once autosave has put it in the address. The
   * form is keyed by draft, and without this the id appearing in the URL
   * would remount it as a "different" draft, throwing away its checks.
   * Opening another draft from the list still remounts, as it should.
   */
  const [bound, setBound] = useState<string | null>(null);
  const [formKey, setFormKey] = useState<string | null>(null);
  if (!hydrated) return <Skeleton className="h-96 w-full" />;
  const draftId = sp.get('draft');
  const template = TEMPLATES.find((t) => t.id === sp.get('template'));
  const initial: StoredDraft | null = draftId
    ? (drafts.find((d) => d.id === draftId) ?? null)
    : template
      ? { id: `draft-${startedAt}`, draft: { ...template.draft }, mode: 'new', step: 0, updatedAt: new Date(startedAt).toISOString() }
      : null;
  const key = formKey === null || (draftId !== null && draftId !== bound && draftId !== formKey) ? (initial?.id ?? 'blank') : formKey;
  if (key !== formKey) setFormKey(key);
  return <CreateAgent key={key} initial={initial} onBound={setBound} />;
}
