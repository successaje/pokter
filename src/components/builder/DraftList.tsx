'use client';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { draftProgress, draftTitle, type StoredDraft } from '@/lib/builder/drafts';

function when(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Drafts already started, offered before the path chooser.
 *
 * The launchpad kept exactly one draft and never mentioned it: somebody
 * who had begun an agent, left, and come back was shown the same "what do
 * you have right now?" as a first-time visitor, with their work restored
 * silently underneath. Two people could not keep two drafts at all — the
 * second overwrote the first with no warning that it had.
 *
 * Shown above the chooser rather than inside it, because resuming is not
 * a fifth kind of starting point; it is the thing to do instead of
 * starting.
 */
export function DraftList({
  drafts,
  onResume,
  onDelete,
}: {
  drafts: StoredDraft[];
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (drafts.length === 0) return null;

  return (
    <section
      aria-labelledby="drafts-heading"
      className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="drafts-heading" className="text-[13px] font-semibold">
          {drafts.length === 1 ? 'A draft in progress' : `${drafts.length} drafts in progress`}
        </h2>
        <span className="text-[11px] text-[color:var(--text-muted)]">
          Saved on this device
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {drafts.map((entry) => {
          const progress = draftProgress(entry.draft);
          const category = CATEGORY_BY_ID.get(
            entry.draft.category as Parameters<typeof CATEGORY_BY_ID.get>[0],
          );
          return (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
            >
              <button
                type="button"
                onClick={() => onResume(entry.id)}
                className="tap min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[12px] font-medium">
                  {draftTitle(entry.draft)}
                </span>
                <span className="mt-0.5 block text-[10px] text-[color:var(--text-muted)]">
                  {category ? `${category.label} · ` : ''}
                  {progress.done} of {progress.total} filled in · {when(entry.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onResume(entry.id)}
                className="tap shrink-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[11px] font-semibold"
              >
                Continue
              </button>
              {/*
                Discarding says what it is. A draft lives only in this
                browser, so there is nowhere to recover it from and the
                label should not imply otherwise.
              */}
              <button
                type="button"
                onClick={() => onDelete(entry.id)}
                aria-label={`Discard ${draftTitle(entry.draft)}`}
                className="tap shrink-0 rounded-[var(--radius)] px-2 py-1.5 text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--negative)]"
              >
                Discard
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
