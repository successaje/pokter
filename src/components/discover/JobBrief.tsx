'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/*
 * The examples are the instructions.
 *
 * An empty box asking someone to describe a job gets a blank stare — the hard
 * part is not typing, it is knowing what kind of thing to say. They drop open
 * on focus rather than sitting on the page, so they teach the person who needs
 * teaching and stay out of the way of the person who does not.
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
 * One line, not a panel. The first build gave this a heading, a paragraph, a
 * three-row textarea, four permanent chips and a footnote — a page-sized
 * apparatus in front of a box you type one sentence into, which made a fast
 * path look like a form to fill in.
 *
 * Deliberately not called Ask AI. Today it reads keywords, and a label
 * promising intelligence would be this product overclaiming about itself on
 * the page whose whole purpose is to stop agents doing that. The name
 * describes what the reader does, so what answers them can improve underneath
 * without the label becoming a lie.
 */
export function JobBrief({ initial = '' }: { initial?: string }) {
  const [brief, setBrief] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /* A dropdown that survives a click elsewhere is a dropdown that is stuck. */
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const submit = (value: string) => {
    const text = value.trim();
    if (!text) return;
    setOpen(false);
    setPending(true);
    router.push(`/discover?brief=${encodeURIComponent(text)}#brief-results`);
  };

  return (
    <div ref={wrap} className="relative flex flex-col gap-1.5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(brief);
        }}
        className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-1.5 pl-4 transition-colors focus-within:border-[color:var(--brand)]"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-4 shrink-0 fill-none stroke-current text-[color:var(--text-faint)]"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
        </svg>

        <label htmlFor="brief" className="sr-only">
          Describe the job you want done
        </label>
        <input
          id="brief"
          name="brief"
          autoComplete="off"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="Describe the job you want done…"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[color:var(--text-faint)]"
        />

        <button
          type="submit"
          disabled={pending || brief.trim().length === 0}
          className="action-primary inline-flex min-h-9 shrink-0 items-center rounded-[var(--radius)] px-4 text-[12px] font-semibold disabled:opacity-40"
        >
          {pending ? 'Reading…' : 'Find agents'}
        </button>
      </form>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] shadow-lg">
          <p className="border-b border-[color:var(--border)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-faint)]">
            Say it in your own words
          </p>
          <ul>
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  /*
                   * mousedown, not click: the outside-click listener closes
                   * this on mousedown, which would unmount the row before a
                   * click ever landed on it.
                   */
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setBrief(example);
                    submit(example);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-[13px] text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
