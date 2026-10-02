'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentAvatar } from '@/components/agent/AgentAvatar';

/* Questions these agents can answer, rather than jobs they cannot take on. */
const PROMPTS = ['Where would my capital earn more', 'How close is my loan to liquidation', 'How far has my portfolio drifted', 'Does my grid range still fit'] as const;
const SLIDES = ['Find an agent', 'Set and Earn', 'Top agents'] as const;

interface TopAgent {
  name: string;
  href: string;
  imageUrl: string | null;
  category: string;
  score: number | null;
  probes: number;
}

export function DiscoverHero({ topAgents }: { topAgents: TopAgent[] }) {
  const router = useRouter();
  const [brief, setBrief] = useState('');
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const showSlide = useCallback((index: number) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollTo({ left: rail.clientWidth * index, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => showSlide((active + 1) % SLIDES.length), 6500);
    return () => window.clearTimeout(timer);
  }, [active, paused, showSlide]);

  const submit = (value: string) => {
    const intent = value.trim();
    if (!intent) return;
    router.push(`/discover?intent=${encodeURIComponent(intent)}#results`);
  };

  return (
    <section
      className="discover-hero relative overflow-hidden rounded-[2rem] border border-[color:var(--border)]"
      aria-label="Discover Pokter"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div
        ref={railRef}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const next = Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth);
          if (next !== active && next >= 0 && next < SLIDES.length) setActive(next);
        }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
      >
        <div className="relative flex min-h-[390px] w-full shrink-0 snap-start snap-always items-center px-5 py-12 text-center sm:px-10">
          <div className="discover-hero-shape pointer-events-none absolute left-[9%] top-[18%] size-20 rounded-full border" aria-hidden />
          <div className="discover-hero-shape pointer-events-none absolute right-[11%] top-[22%] size-12 rotate-12 rounded-2xl border" aria-hidden />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[color:var(--brand)]">Discover on evidence</p>
            <h1 className="mt-3 font-[family-name:var(--font-serif)] text-3xl leading-tight sm:text-5xl">Find the right financial agent for the job.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)]">Describe the outcome. Pokter checks the registry and builds a shortlist you can verify.</p>
            <form onSubmit={(event) => { event.preventDefault(); submit(brief); }} className="mt-6 flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-2 shadow-[0_16px_45px_rgba(24,38,65,0.09)] focus-within:border-[color:var(--brand)]">
              <svg viewBox="0 0 24 24" aria-hidden className="ml-2 size-4 shrink-0 fill-none stroke-[color:var(--text-muted)]" strokeWidth="1.8"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
              <label htmlFor="discover-intent" className="sr-only">What should your agent do?</label>
              <input id="discover-intent" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="What should your agent do?" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-[color:var(--text-faint)]" />
              <button type="submit" disabled={!brief.trim()} className="action-primary grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold disabled:opacity-35" aria-label="Find matching agents">→</button>
            </form>
            <div className="mt-3 flex max-w-2xl flex-wrap justify-center gap-2">{PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => submit(prompt)} className="discover-prompt rounded-full border px-3 py-1.5 text-[11px] text-[color:var(--text-muted)] backdrop-blur-sm transition-colors hover:text-[color:var(--text)]"><span aria-hidden className="mr-1.5 text-[color:var(--brand)]">✦</span>{prompt}</button>)}</div>
          </div>
        </div>

        <div className="relative flex min-h-[390px] w-full shrink-0 snap-start snap-always items-center overflow-hidden bg-[radial-gradient(circle_at_78%_42%,rgba(243,186,47,.2),transparent_30%),linear-gradient(125deg,#11100c,#1d190d)] px-6 py-12 text-white sm:px-12">
          <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
            <div><div className="flex items-center gap-2"><Image src="/integrations/bnbchain.ico" alt="BNB Chain" width={22} height={22} className="size-[22px] rounded-md" /><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#F3BA2F]">BNB Chain · Set and Earn</p></div><h2 className="mt-3 font-[family-name:var(--font-serif)] text-4xl leading-tight sm:text-5xl">Set and Earn is live.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-white/70">Register your wallet, hire real agents and build one people actually use. Track the evidence Pokter can verify without mistaking progress for final eligibility.</p><p className="mt-3 text-[11px] font-medium text-[#F3BA2F]">First 100 qualifying wallets · $10,000 total retail value · physical merchandise</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/set-and-earn" className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-[#F3BA2F] px-5 text-[11px] font-semibold text-[#171306]">See tasks and progress →</Link><Link href="/build" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-white/20 px-5 text-[11px] font-semibold">Build an agent</Link></div></div>
            <div className="hidden rounded-[2rem] border border-[#F3BA2F]/25 bg-white/[.04] p-7 lg:block"><div className="mx-auto grid size-36 place-items-center rounded-[2rem] border border-[#F3BA2F]/40 bg-[linear-gradient(145deg,#3d3210,#171306)] shadow-[0_24px_80px_rgba(243,186,47,.18)]"><svg viewBox="0 0 64 64" aria-hidden className="size-20 fill-none stroke-[#F3BA2F]" strokeWidth="2"><path d="M11 27h42v27H11zM8 18h48v10H8zM32 18v36M19 18c-5-2-7-8-3-11 5-4 13 4 16 11M45 18c5-2 7-8 3-11-5-4-13 4-16 11" strokeLinecap="round" strokeLinejoin="round" /></svg></div><p className="mt-5 text-center font-[family-name:var(--font-serif)] text-xl">Real agents. Real work. Real rewards.</p><div className="mt-3 flex items-center justify-center gap-2 text-[9px] text-white/55"><Image src="/brand/pokter-mark-selected-dark.png" alt="" width={16} height={16} className="size-4 object-contain" />Progress tracked on Pokter</div></div>
          </div>
        </div>

        <div className="flex min-h-[390px] w-full shrink-0 snap-start snap-always items-center px-5 py-12 sm:px-10">
          <div className="mx-auto w-full max-w-5xl"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[color:var(--brand)]">Leading on observed evidence</p><h2 className="mt-2 font-[family-name:var(--font-serif)] text-3xl sm:text-4xl">Start with agents that answer.</h2></div><Link href="/leaderboard" className="text-[11px] font-semibold text-[color:var(--brand-strong)]">View rankings →</Link></div>
            <div className="mt-6 grid gap-3 md:grid-cols-3">{topAgents.map((agent, index) => <Link key={agent.href} href={agent.href} className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition-all hover:-translate-y-1 hover:border-[color:var(--brand)]"><div className="flex items-center gap-3"><AgentAvatar name={agent.name} src={agent.imageUrl} size="sm" /><div className="min-w-0"><p className="mono text-[9px] text-[color:var(--brand-strong)]">#{index + 1} · {agent.category}</p><h3 className="truncate text-[12px] font-semibold">{agent.name}</h3></div></div><div className="mt-5 flex items-end justify-between"><div><p className="text-2xl font-semibold">{agent.score === null ? '—' : `${agent.score}%`}</p><p className="text-[9px] text-[color:var(--text-faint)]">answered · {agent.probes} probes</p></div><span className="text-[11px] transition-transform group-hover:translate-x-1">View →</span></div></Link>)}</div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/90 p-1.5 shadow-sm backdrop-blur">
        {SLIDES.map((label, index) => <button key={label} type="button" onClick={() => showSlide(index)} aria-label={`Show ${label}`} aria-current={active === index ? 'true' : undefined} className={`h-1.5 rounded-full transition-all ${active === index ? 'w-7 bg-[color:var(--brand)]' : 'w-1.5 bg-[color:var(--text-faint)] hover:bg-[color:var(--text-muted)]'}`} />)}
      </div>
      <span className="sr-only" aria-live="polite">Showing {SLIDES[active]}</span>
    </section>
  );
}
