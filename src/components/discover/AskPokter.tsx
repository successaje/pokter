'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const EXAMPLES = [
  'I want to earn more yield on my USDT without losing the principal',
  'Automatically protect my portfolio if the market drops 15%',
  'Keep my BNB/USDT liquidity position inside its range',
  'Trade a price range for me without me watching it',
] as const;

function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 2.5c.35 3.9 2.6 6.15 6.5 6.5-3.9.35-6.15 2.6-6.5 6.5-.35-3.9-2.6-6.15-6.5-6.5 3.9-.35 6.15-2.6 6.5-6.5Z" />
      <path d="M18.5 15.5c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3Z" />
    </svg>
  );
}

/**
 * The way in, in one row until someone wants more.
 *
 * Collapsed it is a single bar: what it does, and two briefs someone can press
 * instead of composing one. Opening it is the only thing that costs the page
 * height, and it only happens when a visitor has decided they want it.
 *
 * Named for what the reader does rather than for what answers them. Today a
 * keyword reading picks the category; a model can replace that without this
 * label becoming a claim the product cannot support — which "Ask AI" would be
 * on a page whose whole argument is that a claim is not evidence.
 */
export function AskPokter({ initial = '' }: { initial?: string }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState(initial);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const submit = (value: string) => {
    const text = value.trim();
    if (!text) return;
    setPending(true);
    router.push(`/discover?brief=${encodeURIComponent(text)}#ask`);
  };

  if (!open) {
    return (
      <section
        id="ask"
        aria-label="Describe what you need"
        className="scroll-mt-24 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-4 p-4 text-left sm:p-5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]">
            <Spark className="size-5" />
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-semibold">
              Ask Pokter — not sure where to start?
            </span>
            <span className="text-[13px] leading-snug text-[color:var(--text-muted)]">
              Describe what you need in plain English. Get matched agents with
              the evidence behind each one.
            </span>
          </span>

          {/*
            Two briefs, desktop only. On a phone they would push the bar to
            three rows and the point of the bar is that it is one.
          */}
          <span className="hidden shrink-0 items-center gap-2 lg:flex">
            {EXAMPLES.slice(0, 2).map((example) => (
              <span
                key={example}
                className="max-w-[15rem] truncate rounded-[var(--radius)] bg-[color:var(--bg-subtle)] px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)]"
              >
                &ldquo;{example}&rdquo;
              </span>
            ))}
          </span>

          <span
            aria-hidden
            className="shrink-0 text-[color:var(--text-muted)] transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </button>
      </section>
    );
  }

  return (
    <section
      id="ask"
      aria-label="Describe what you need"
      className="scroll-mt-24 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
    >
      <header className="flex items-start gap-3 border-b border-[color:var(--border)] p-4 sm:p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]">
          <Spark className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-semibold">Ask Pokter</span>
          <span className="text-[13px] text-[color:var(--text-muted)]">
            Describe your goal — get matched agents
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
        >
          ✕
        </button>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(brief);
        }}
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <label htmlFor="ask-brief" className="sr-only">
          What do you need an agent to do?
        </label>
        <textarea
          id="ask-brief"
          autoFocus
          rows={3}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit(brief);
            }
          }}
          placeholder="What do you need an agent to do? E.g. 'I want to earn more yield on my USDT without risking the principal'"
          className="w-full resize-none rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-3.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-[color:var(--text-faint)] focus-visible:border-[color:var(--brand)]"
        />

        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-[color:var(--text-muted)]">
            Try one of these:
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setBrief(example);
                  submit(example);
                }}
                className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] px-3 py-2 text-left text-[12px] text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
              >
                &ldquo;{example}&rdquo;
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/*
            The claim this panel has to make about itself. A conversational
            front door is where a marketplace would put paid placement, so the
            absence of it is worth stating where the ranking is produced.
          */}
          <p className="text-[12px] text-[color:var(--text-muted)]">
            Matching uses measured evidence, not sponsored rankings
          </p>
          <button
            type="submit"
            disabled={pending || brief.trim().length === 0}
            className="action-primary inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] px-5 text-[13px] font-semibold disabled:opacity-40"
          >
            {pending ? 'Matching…' : 'Find agents'}
            <span aria-hidden>→</span>
          </button>
        </div>
      </form>
    </section>
  );
}
