'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/*
 * The examples are the instructions.
 *
 * An empty box asking someone to describe a job gets a blank stare — the hard
 * part is not typing, it is knowing what kind of thing to say. These are
 * phrased the way a person would actually put it, not the way the category is
 * named, because translating between the two is the work this feature exists
 * to do.
 */
const EXAMPLES = [
  'Warn me before my Venus loan gets liquidated',
  'Put idle USDT to work at the best rate you can evidence',
  'Keep my BNB/USDT LP inside its range',
  'Trade a price range for me without me watching it',
] as const;

/**
 * Describe the job.
 *
 * Deliberately not called Ask AI. Today it reads keywords, and a name
 * promising intelligence would be the product overclaiming about itself on the
 * one page whose whole purpose is to stop agents doing that. The name
 * describes what the reader does; what answers them can improve underneath
 * without the label becoming a lie.
 */
export function JobBrief({ initial = '' }: { initial?: string }) {
  const [brief, setBrief] = useState(initial);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const submit = (value: string) => {
    const text = value.trim();
    if (!text) return;
    setPending(true);
    router.push(`/discover?brief=${encodeURIComponent(text)}#brief-results`);
  };

  return (
    <section
      aria-labelledby="job-brief-title"
      className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">
          Describe the job
        </p>
        <h2 id="job-brief-title" className="display text-2xl sm:text-3xl">
          What do you want an agent to do?
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Say it in your own words. Pokter reads the brief, then ranks the
          agents it has measured against it — and shows you what it understood,
          so you can tell whether it read you correctly.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(brief);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="brief" className="sr-only">
          Describe the job
        </label>
        <textarea
          id="brief"
          name="brief"
          rows={3}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          onKeyDown={(event) => {
            // Enter submits, Shift+Enter breaks the line — the convention for
            // a box people will type one sentence into.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit(brief);
            }
          }}
          placeholder="e.g. Watch my lending position and tell me before it gets close to liquidation."
          className="w-full resize-none rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-3.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-[color:var(--text-faint)] focus-visible:border-[color:var(--brand)]"
        />

        <div className="flex flex-wrap items-center gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setBrief(example);
                submit(example);
              }}
              className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-left text-[11px] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-[color:var(--text-faint)]">
            Nothing is hired from here. This only decides what you are shown.
          </p>
          <button
            type="submit"
            disabled={pending || brief.trim().length === 0}
            className="action-primary inline-flex min-h-10 items-center rounded-[var(--radius)] px-5 text-[13px] font-semibold disabled:opacity-45"
          >
            {pending ? 'Reading the brief…' : 'Find agents'}
          </button>
        </div>
      </form>
    </section>
  );
}
