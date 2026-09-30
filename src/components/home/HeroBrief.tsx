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
 * Here it is an input. The four objectives survive as chips beside it, because
 * an empty box is worse than a menu for somebody who does not yet know what to
 * type, and they are the same four categories Pokter can actually judge.
 *
 * Submitting leaves for the catalogue rather than answering in place: the
 * answer is a set of agents, the catalogue is the thing built to show a set of
 * agents, and duplicating it here would be a second worse one.
 */
const OBJECTIVES = [
  { label: 'Earn on idle capital', brief: 'Put my idle capital to work earning yield' },
  { label: 'Trade to a plan', brief: 'Trade with a repeatable grid strategy rather than by impulse' },
  { label: 'Avoid liquidation', brief: 'Warn me before my lending position gets liquidated' },
  { label: 'Stay in range', brief: 'Keep my portfolio weights and liquidity range where I intended' },
] as const;

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
          placeholder="What are you trying to do?"
          className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-[13px] outline-none placeholder:text-[color:var(--text-faint)]"
        />
        <button
          type="submit"
          disabled={brief.trim().length === 0}
          aria-label="Find matching agents"
          className="action-primary flex size-8 shrink-0 items-center justify-center rounded-[calc(var(--radius)-2px)] text-[13px] font-semibold transition-opacity disabled:opacity-35"
        >
          →
        </button>
      </form>

      <div className="flex flex-wrap justify-center gap-1.5">
        {OBJECTIVES.map((objective) => (
          <button
            key={objective.label}
            type="button"
            onClick={() => go(objective.brief)}
            className="hero-objective rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[11px] text-[color:var(--text-muted)] transition-[color,border-color,background-color,transform] hover:-translate-y-0.5 hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]"
          >
            {objective.label}
          </button>
        ))}
      </div>
    </div>
  );
}
