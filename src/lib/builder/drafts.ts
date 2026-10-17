export interface DraftFields {
  name: string;
  description: string;
  category: string;
  protocol: 'a2a' | 'mcp';
  endpoint: string;
  image: string;
  repository: string;
}

export interface StoredDraft {
  id: string;
  draft: DraftFields;
  /** Which path the builder was on, and how far into it. */
  mode: 'choose' | 'existing' | 'new' | 'templates';
  step: number;
  updatedAt: string;
}

export type DraftRecord = Record<string, StoredDraft>;

export const DRAFTS_KEY = 'pokter-agent-drafts-v1';
/** The single slot drafts lived in before there could be more than one. */
export const LEGACY_DRAFT_KEY = 'pokter-agent-draft-v1';
export const LEGACY_PLACE_KEY = 'pokter-agent-place-v1';

/** Newest first: the one someone is most likely to be coming back to. */
export function listDrafts(record: DraftRecord): StoredDraft[] {
  return Object.values(record).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertDraft(record: DraftRecord, entry: StoredDraft): DraftRecord {
  return { ...record, [entry.id]: entry };
}

export function removeDraft(record: DraftRecord, id: string): DraftRecord {
  const next = { ...record };
  delete next[id];
  return next;
}

/**
 * What to call a draft in a list of them.
 *
 * A builder with three unnamed drafts needs to tell them apart, and the
 * name is the field most likely to still be blank — it is the first thing
 * asked for and the first thing skipped. The description is the next
 * strongest thing they actually typed.
 */
export function draftTitle(draft: DraftFields): string {
  const name = draft.name.trim();
  if (name) return name;
  const description = draft.description.trim();
  if (description) {
    const firstLine = description.split(/[.\n]/)[0]!.trim();
    return firstLine.length > 48 ? `${firstLine.slice(0, 45)}…` : firstLine;
  }
  return 'Untitled draft';
}

/** Nothing typed yet — not worth keeping or showing in a list. */
export function isDraftEmpty(draft: DraftFields): boolean {
  return !(
    draft.name.trim() ||
    draft.description.trim() ||
    draft.category.trim() ||
    draft.endpoint.trim() ||
    draft.image.trim() ||
    draft.repository.trim()
  );
}

/**
 * Carry the one draft that existed into the record that holds many.
 *
 * Someone mid-build when this shipped must not lose their work, and must
 * not end up with a duplicate of it either, so the legacy slot converts
 * exactly once: if the record already holds anything, it has already run.
 */
export function migrateLegacyDraft(
  record: DraftRecord,
  legacy: { draft: DraftFields; mode?: StoredDraft['mode']; step?: number } | null,
  now: string,
  id: string,
): DraftRecord {
  if (Object.keys(record).length > 0) return record;
  if (!legacy || isDraftEmpty(legacy.draft)) return record;
  return upsertDraft(record, {
    id,
    draft: legacy.draft,
    mode: legacy.mode ?? 'new',
    step: Number.isInteger(legacy.step) ? legacy.step! : 0,
    updatedAt: now,
  });
}

/** How far along a draft is, for a list that has to rank them at a glance. */
export function draftProgress(draft: DraftFields): { done: number; total: number } {
  const checks = [
    draft.name.trim().length >= 3,
    draft.description.trim().length >= 40,
    Boolean(draft.category.trim()),
    Boolean(draft.endpoint.trim()),
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
}

/*
 * Reading drafts as an external store.
 *
 * The same shape this codebase already uses for jobs and notifications:
 * localStorage is shared mutable state outside React, so it is subscribed
 * to rather than copied into state by an effect — which also means a
 * draft discarded in one tab disappears from the account page in another.
 *
 * The snapshot is cached against the raw string because
 * `useSyncExternalStore` compares by identity: parsing afresh on every
 * call would hand React a new array each time and spin.
 */
const DRAFTS_EVENT = 'pokter:drafts';
let snapshotSource: string | null = null;
let snapshotValue: StoredDraft[] = [];
const EMPTY: StoredDraft[] = [];

export function subscribeToDrafts(listener: () => void): () => void {
  window.addEventListener(DRAFTS_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(DRAFTS_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function draftsSnapshot(): StoredDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (raw === snapshotSource) return snapshotValue;
    snapshotSource = raw;
    snapshotValue = raw ? listDrafts(JSON.parse(raw) as DraftRecord) : EMPTY;
    return snapshotValue;
  } catch {
    return EMPTY;
  }
}

/** The server has no browser storage, so it renders the empty case. */
export function draftsServerSnapshot(): StoredDraft[] {
  return EMPTY;
}

/** Tell this tab's listeners; other tabs hear the storage event. */
export function announceDraftsChanged(): void {
  try {
    window.dispatchEvent(new Event(DRAFTS_EVENT));
  } catch {
    /* Nothing to announce to outside a browser. */
  }
}

/*
 * Whether the draft on screen is actually saved.
 *
 * The page said "Saved on this device as you go" whatever happened, and a
 * failed write (storage full, blocked, private mode) was swallowed. The
 * status is now derived from what storage holds: saved only when the stored
 * copy matches the form, failed when the last write threw.
 */
export type DraftSaveStatus = 'empty' | 'saving' | 'saved' | 'failed';

const FIELDS: ReadonlyArray<keyof DraftFields> = ['name', 'description', 'category', 'protocol', 'endpoint', 'image', 'repository'];

export function draftSaveStatus(stored: readonly StoredDraft[], id: string, draft: DraftFields, failed: boolean): DraftSaveStatus {
  if (isDraftEmpty(draft)) return 'empty';
  if (failed) return 'failed';
  const copy = stored.find((entry) => entry.id === id);
  return copy && FIELDS.every((field) => copy.draft[field] === draft[field]) ? 'saved' : 'saving';
}

/* Failed writes, as their own small store: a failed write leaves storage
   unchanged, so the drafts snapshot alone would never re-render. */
let failedSaves = '';

export function recordDraftSave(id: string, ok: boolean): void {
  const ids = new Set(failedSaves ? failedSaves.split('\n') : []);
  if (ok) ids.delete(id);
  else ids.add(id);
  const next = [...ids].sort().join('\n');
  if (next === failedSaves) return;
  failedSaves = next;
  announceDraftsChanged();
}

export function failedSavesSnapshot(): string {
  return failedSaves;
}

export function failedSavesServerSnapshot(): string {
  return '';
}
