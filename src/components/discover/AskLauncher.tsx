'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import type { Verdict } from '@/lib/proof/engine';

const EXAMPLES = [
  'Earn more yield on my USDT without risking the principal',
  'How close is my lending position to liquidation',
  'Keep my BNB/USDT liquidity position inside its range',
] as const;

interface Match {
  name: string;
  href: string;
  image: string | null;
  description: string | null;
  category: string | null;
  verdict: Verdict;
  uptime: number | null;
  probes: number;
  attestations: number;
  price: string | null;
}

function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 2.5c.35 3.9 2.6 6.15 6.5 6.5-3.9.35-6.15 2.6-6.5 6.5-.35-3.9-2.6-6.15-6.5-6.5 3.9-.35 6.15-2.6 6.5-6.5Z" />
      <path d="M18.5 15.5c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3Z" />
    </svg>
  );
}

/**
 * Ask Pokter, as a launcher rather than a band across the page.
 *
 * Inline it cost the top of Discover a card of prose before a visitor had
 * asked for anything, on a page whose job is to show agents. Down here it
 * costs a button until it is wanted.
 *
 * It borrows the shape of a support widget and deliberately not the shape of a
 * chat. There is no thread, no message history and no typing indicator,
 * because it cannot hold a conversation — one brief goes in, matched agents
 * come back, and asking again replaces the answer rather than appending to it.
 * Dressing a single-shot matcher as a chat would promise a back-and-forth that
 * does not exist, and the first person to type "what about cheaper ones?"
 * would find that out the hard way.
 */
export function AskLauncher() {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [reply, setReply] = useState('');
  const [results, setResults] = useState<Match[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = async (value: string) => {
    const text = value.trim();
    if (!text) return;
    setBrief(text);
    setState('loading');
    try {
      const response = await fetch(`/api/ask?brief=${encodeURIComponent(text)}`);
      if (!response.ok) throw new Error('request failed');
      const data = await response.json();
      setReply(data.reply);
      setResults(data.results ?? []);
      setState('done');
    } catch {
      setState('error');
    }
  };

  const reset = () => {
    setBrief('');
    setResults([]);
    setReply('');
    setState('idle');
    field.current?.focus();
  };

  return (
    <>
      {/*
        Clears the mobile navigation bar, which is fixed at the foot of every
        page below md and would otherwise sit on top of this.
      */}
      <div
        className="pointer-events-none fixed right-3 z-40 flex flex-col items-end gap-2 sm:right-5"
        style={{
          bottom: 'calc(5.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="contents md:hidden" />
        {open && (
          <div
            ref={panel}
            role="dialog"
            aria-label="Ask Pokter"
            className="pointer-events-auto flex max-h-[min(34rem,70vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] shadow-2xl"
          >
            <header className="flex items-start gap-2.5 border-b border-[color:var(--border)] p-3.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]">
                <Spark className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-semibold">Ask Pokter</span>
                <span className="text-[11px] text-[color:var(--text-muted)]">
                  {/*
                    Says what it is up front. A widget in this corner is read as
                    a chat, and this one answers once.
                  */}
                  One question, matched agents — not a chat
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-m-1 flex size-7 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
              >
                ✕
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3.5">
              {state === 'done' || state === 'loading' ? (
                <div className="flex flex-col gap-3">
                  <p className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-2.5 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                    {state === 'loading' ? 'Matching on measured evidence…' : reply}
                  </p>

                  {state === 'done' &&
                    results.map((match, index) => (
                      <Link
                        key={match.href}
                        href={match.href}
                        onClick={() => setOpen(false)}
                        className="flex flex-col gap-1.5 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-2.5 transition-colors hover:border-[color:var(--brand)]"
                      >
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12px] font-semibold">
                            {match.name}
                          </span>
                          {index === 0 && (
                            <span className="rounded-[var(--radius)] bg-[color:var(--brand-highlight-soft)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[color:var(--brand-strong)]">
                              Best match
                            </span>
                          )}
                          <EvidenceBadge verdict={match.verdict} />
                        </span>
                        <span className="tabular text-[11px] text-[color:var(--text-muted)]">
                          {match.uptime === null
                            ? 'Never probed'
                            : `${match.uptime.toFixed(0)}% of ${match.probes} probes`}
                          {match.price !== null && ` · ${match.price}`}
                        </span>
                      </Link>
                    ))}

                  {state === 'done' && results.length === 0 && (
                    <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                      Nothing in the indexed set matches this. That is a fact
                      about the registry rather than a gap here.
                    </p>
                  )}

                  {state === 'done' && (
                    <button
                      type="button"
                      onClick={reset}
                      className="self-start text-[11px] text-[color:var(--text-muted)] underline decoration-dotted underline-offset-2 hover:text-[color:var(--text)]"
                    >
                      ← Ask a different question
                    </button>
                  )}
                </div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    ask(brief);
                  }}
                  className="flex flex-col gap-2.5"
                >
                  <label htmlFor="ask-launcher" className="sr-only">
                    What do you need an agent to do?
                  </label>
                  <textarea
                    id="ask-launcher"
                    ref={field}
                    rows={3}
                    value={brief}
                    onChange={(event) => setBrief(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        ask(brief);
                      }
                    }}
                    placeholder="What do you need an agent to do?"
                    className="w-full resize-none rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-2.5 text-[13px] leading-relaxed outline-none transition-colors placeholder:text-[color:var(--text-faint)] focus-visible:border-[color:var(--brand)]"
                  />

                  {state === 'error' && (
                    <p className="text-[11px] text-[color:var(--negative)]">
                      Could not reach the matcher. Browsing below still works.
                    </p>
                  )}

                  <div className="flex flex-col gap-1.5">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => ask(example)}
                        className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] px-2.5 py-2 text-left text-[11px] leading-snug text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
                      >
                        &ldquo;{example}&rdquo;
                      </button>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={brief.trim().length === 0}
                    className="action-primary inline-flex min-h-9 items-center justify-center rounded-[var(--radius)] px-4 text-[12px] font-semibold disabled:opacity-40"
                  >
                    Find agents →
                  </button>
                </form>
              )}
            </div>

            <p className="border-t border-[color:var(--border)] px-3.5 py-2 text-[10px] text-[color:var(--text-faint)]">
              Matched on measured evidence, not sponsored rankings.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? 'Close Ask Pokter' : 'Ask Pokter'}
          className="action-primary pointer-events-auto flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold shadow-lg transition-transform hover:-translate-y-0.5"
        >
          <Spark className="size-4" />
          <span className="hidden sm:inline">{open ? 'Close' : 'Ask Pokter'}</span>
        </button>
      </div>
    </>
  );
}
