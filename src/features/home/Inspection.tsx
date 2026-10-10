'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';
import { VerdictLabel } from '@/ui/Verdict';
import type { Specimen, SpecimenCheck } from './data';

const STEP_MS = 520;
const HOLD_MS = 5200;

const TONE: Record<SpecimenCheck['tone'], string> = {
  ok: 'text-ok',
  watch: 'text-watch',
  bad: 'text-bad',
  none: 'text-ink-3',
};

function CheckGlyph({ tone }: { tone: SpecimenCheck['tone'] }) {
  if (tone === 'ok') return <Icon.Check size={15} />;
  if (tone === 'bad') return <Icon.Cross size={15} />;
  if (tone === 'watch') return <Icon.Alert size={15} />;
  return <Icon.Dash size={15} />;
}

/**
 * The hero's argument, performed: an agent makes a claim, and Pokter reads
 * what is actually on record about it, one check at a time. Every value is
 * read from the registry, the probe history and the escrow index at render
 * time. The sequence only paces the reveal; it never invents a state. With
 * reduced motion every line is shown resolved and nothing advances on its
 * own.
 */
export function Inspection({ specimens }: { specimens: Specimen[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const specimen = specimens[index];
  const total = specimen ? specimen.checks.length + 1 : 0;

  useEffect(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (!specimen) return;
    if (still) {
      setRevealed(total);
      return;
    }
    setRevealed(0);
    for (let step = 1; step <= total; step += 1) {
      timers.current.push(window.setTimeout(() => setRevealed(step), 380 + step * STEP_MS));
    }
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, [index, still, total, specimen]);

  useEffect(() => {
    if (still || paused || specimens.length < 2 || revealed < total) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % specimens.length), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [revealed, total, paused, still, specimens.length]);

  if (!specimen) {
    return (
      <div className="flex min-h-[420px] flex-col justify-center gap-3 rounded-[18px] border border-rule bg-raised p-8">
        <span className="t-label">Inspection</span>
        <p className="text-ink-2">The registry did not answer just now, so there is nothing live to inspect. Pokter shows real agents here or nothing.</p>
      </div>
    );
  }

  const go = (next: number) => setIndex((next + specimens.length) % specimens.length);

  return (
    <figure
      className="relative overflow-hidden rounded-[18px] border border-rule bg-raised shadow-lift"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Live inspections of registered agents"
    >
      <div className="flex items-center justify-between gap-3 border-b border-rule bg-sunken/70 px-5 py-3">
        <span className="flex items-center gap-2">
          <span className="tile" aria-hidden />
          <span className="t-label text-ink-2">Inspection</span>
          <span className="t-readout text-[11px] text-ink-3">
            {String(index + 1).padStart(2, '0')}/{String(specimens.length).padStart(2, '0')}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <span className="size-1.5 rounded-full bg-ok pulse" aria-hidden />
          Live registry data
        </span>
      </div>

      <div className="flex flex-col gap-5 px-5 pb-5 pt-5 sm:px-6" aria-live="polite">
        <div key={specimen.key} className="anim-fade flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <Link href={specimen.href} className="t-h3 truncate hover:underline">
              {specimen.name}
            </Link>
            <span className="shrink-0 text-[12px] text-ink-3">{specimen.category}</span>
          </div>
          <blockquote className="relative border-l-2 border-rule-strong pl-4 text-[14px] leading-relaxed text-ink-2">
            <span className="t-label mb-1 block">It claims</span>
            &ldquo;{specimen.claim}&rdquo;
          </blockquote>
        </div>

        <div>
          <span className="t-label mb-1 block">Pokter finds</span>
          <ol className="ruled">
            {specimen.checks.map((check, i) => {
              const shown = revealed > i;
              const checking = revealed === i;
              return (
                <li key={check.id} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-[13.5px]">
                  <span className={cn('grid place-items-center transition-opacity duration-300', shown ? TONE[check.tone] : 'text-ink-3 opacity-40')}>
                    {shown ? <CheckGlyph tone={check.tone} /> : <span className="size-1.5 rounded-full bg-current" />}
                  </span>
                  <span className={cn('truncate', shown ? 'text-ink' : 'text-ink-3')}>{check.label}</span>
                  <span className="relative min-w-[7rem] text-right">
                    {shown ? (
                      <span className={cn('t-readout anim-fade text-[12.5px]', check.tone === 'none' ? 'text-ink-3' : 'text-ink')}>{check.result}</span>
                    ) : checking ? (
                      <span className="relative inline-block h-[3px] w-20 overflow-hidden rounded-full bg-sunken align-middle" aria-hidden>
                        <span className="absolute inset-y-0 w-1/2 rounded-full bg-ink-3" style={{ animation: 'scan 900ms var(--ease-in-out) infinite' }} />
                      </span>
                    ) : (
                      <span className="t-readout text-[12.5px] text-ink-3/60">—</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div
          className={cn(
            'flex flex-col gap-2 rounded-[12px] border px-4 py-3 transition-[opacity,transform] duration-500 sm:flex-row sm:items-center sm:justify-between',
            revealed > specimen.checks.length ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
            'border-rule bg-paper',
          )}
        >
          <div className="flex flex-col gap-1">
            <VerdictLabel verdict={specimen.verdict} />
            <p className="text-[13px] leading-snug text-ink-2">{specimen.conclusion}</p>
          </div>
          <Link href={specimen.href} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-ink hover:underline">
            See the evidence <Icon.Arrow size={14} />
          </Link>
        </div>
      </div>

      {specimens.length > 1 && (
        <div className="flex items-center justify-between border-t border-rule px-5 py-2.5">
          <div className="flex gap-1.5" role="tablist" aria-label="Choose an inspection">
            {specimens.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Inspection ${i + 1}: ${s.name}`}
                onClick={() => go(i)}
                className={cn('h-1.5 rounded-full transition-all duration-300', i === index ? 'w-6 bg-ink' : 'w-1.5 bg-rule-strong hover:bg-ink-3')}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => go(index - 1)} className="grid size-8 place-items-center rounded-[8px] text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Previous inspection">
              <Icon.ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => go(index + 1)} className="grid size-8 place-items-center rounded-[8px] text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Next inspection">
              <Icon.ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </figure>
  );
}
