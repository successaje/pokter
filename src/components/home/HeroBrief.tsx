'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The question the landing page used to spend 1,858 pixels asking.
 *
 * "What are you trying to do?" was a full section of four scenes, each with a
 * heading, a paragraph and a rail of agents — three hundred words to ask one
 * question, in the place a visitor has just arrived and decided nothing. It
 * asked well and answered slowly.
 *
 * Here it is an input, and only an input. The four objectives survived beside
 * it as chips for a while, on the argument that an empty box is worse than a
 * menu — but the page grew a Browse by outcome section two screens down that
 * asks the same question with the same four answers and attaches real agents
 * to each, so the menu existed twice and "Check liquidation risk" appeared
 * word for word in both. The better one stayed.
 *
 * The chips also wrote the user's words for them: clicking one navigated to
 * /agents?brief=How+close+is+my+lending+position+to+liquidation, and the
 * results page then quoted that sentence back as though it had been typed.
 * An example in the placeholder gives the same hint and claims nothing.
 *
 * Submitting leaves for the catalogue rather than answering in place: the
 * answer is a set of agents, the catalogue is the thing built to show a set of
 * agents, and duplicating it here would be a second worse one.
 */

export function HeroBrief() {
  const router = useRouter();
  const [brief, setBrief] = useState('');

  const go = (text: string) => {
    const value = text.trim();
    if (!value) return;
    router.push(`/agents?brief=${encodeURIComponent(value)}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-2.5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go(brief);
        }}
        className="hero-brief-form flex items-center gap-2 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-1.5 transition-[border-color,box-shadow,transform] focus-within:-translate-y-0.5 focus-within:border-[color:var(--brand)]"
      >
        <label htmlFor="hero-brief" className="sr-only">
          What are you trying to do?
        </label>
        <input
          id="hero-brief"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="e.g. how close is my loan to liquidation"
          className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-[13px] outline-none placeholder:text-[color:var(--text-faint)]"
        />
        {/*
          Submit affordance, not a second call to action.

          In brand gold this matched "Find an agent" eighty-four pixels above
          it, so the fold carried two primary buttons that led to the same
          catalogue. It belongs to the input it sits inside, so it now reads
          as part of that control and the hero keeps one primary.
        */}
        <button
          type="submit"
          disabled={brief.trim().length === 0}
          aria-label="Find matching agents"
          className="flex size-8 shrink-0 items-center justify-center rounded-[calc(var(--radius)-2px)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] text-[13px] font-semibold text-[color:var(--text)] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-35"
        >
          →
        </button>
      </form>

    </div>
  );
}
