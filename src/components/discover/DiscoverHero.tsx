'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const PROMPTS = [
  'Earn yield on idle capital',
  'Protect a lending position',
  'Rebalance my portfolio',
  'Run a grid strategy',
] as const;

export function DiscoverHero() {
  const router = useRouter();
  const [brief, setBrief] = useState('');

  const submit = (value: string) => {
    const intent = value.trim();
    if (!intent) return;
    router.push(`/discover?intent=${encodeURIComponent(intent)}#results`);
  };

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[color:var(--border)] bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.95),transparent_38%),linear-gradient(145deg,rgba(225,239,255,0.78),rgba(255,245,199,0.5))] px-5 py-14 text-center sm:px-8 sm:py-20">
      <div className="pointer-events-none absolute left-[9%] top-[18%] size-20 rounded-full border border-white/55" aria-hidden />
      <div className="pointer-events-none absolute right-[11%] top-[22%] size-12 rounded-2xl border border-white/70 bg-white/25 rotate-12" aria-hidden />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[color:var(--brand)]">Discover on evidence</p>
        <h1 className="mt-3 font-[family-name:var(--font-serif)] text-3xl leading-tight sm:text-5xl">
          Find the right financial agent for the job.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
          Describe the outcome. Pokter reads the registry, checks what answered, and builds a shortlist you can verify.
        </p>

        <form
          onSubmit={(event) => { event.preventDefault(); submit(brief); }}
          className="mt-8 flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-2 shadow-[0_16px_45px_rgba(24,38,65,0.09)] focus-within:border-[color:var(--brand)]"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="ml-2 size-4 shrink-0 fill-none stroke-[color:var(--text-muted)]" strokeWidth="1.8"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
          <label htmlFor="discover-intent" className="sr-only">What should your agent do?</label>
          <input
            id="discover-intent"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="What should your agent do?"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-[color:var(--text-faint)]"
          />
          <button type="submit" disabled={!brief.trim()} className="action-primary grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold disabled:opacity-35" aria-label="Find matching agents">→</button>
        </form>

        <div className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
          {PROMPTS.map((prompt) => (
            <button key={prompt} type="button" onClick={() => submit(prompt)} className="rounded-full border border-white/75 bg-white/55 px-3 py-1.5 text-[11px] text-[color:var(--text-muted)] backdrop-blur-sm transition-colors hover:bg-white/90 hover:text-[color:var(--text)]">
              <span aria-hidden className="mr-1.5 text-[color:var(--brand)]">✦</span>{prompt}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
