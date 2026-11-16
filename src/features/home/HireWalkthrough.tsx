'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Walkthrough } from '@/features/home/walkthrough-data';
import { Icon } from '@/ui/icons';

/**
 * A real hire, played back as the five things that happened to it.
 *
 * Drawn rather than filmed. A recording of the product was the first
 * attempt and it is still the most literal answer, but it is baked in one
 * theme, unreadable at phone width, invisible to a screen reader, stale the
 * moment a screen moves, and megabytes. This is the same five beats in text
 * the page already knows how to style, at a few kilobytes, and every value
 * in it is read from a job that really happened (`walkthrough-data.ts`).
 *
 * It plays on its own once, when it is first scrolled to, and then stops.
 * A loop would turn the argument into wallpaper, and this is the part of the
 * page a sceptic is supposed to read rather than watch. Any interaction —
 * a click, a key, a hover — hands control over and it never auto-advances
 * again, because something that keeps moving under a reader who is trying
 * to study it is hostile.
 *
 * Under `prefers-reduced-motion` nothing advances at all: every step is open
 * from the start and the controls still work. That is not a degraded mode,
 * it is the same content without the timing.
 */

const STEP_MS = 4200;

export function HireWalkthrough({ walk }: { walk: Walkthrough }) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** Once a reader touches it, it is theirs: no further auto-advance. */
  const [taken, setTaken] = useState(false);
  const [still, setStill] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const steps = walk.steps;

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const read = () => setStill(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);

  /* Starts when it is actually on screen, once. */
  useEffect(() => {
    const node = host.current;
    if (!node || still || taken) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        seen.disconnect();
        setPlaying(true);
      },
      { threshold: 0.35 },
    );
    seen.observe(node);
    return () => seen.disconnect();
  }, [still, taken]);

  useEffect(() => {
    if (!playing || still || taken) return;
    const timer = window.setTimeout(() => {
      setActive((at) => {
        if (at >= steps.length - 1) {
          setPlaying(false);
          return at;
        }
        return at + 1;
      });
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, active, still, taken, steps.length]);

  const take = useCallback((next: number) => {
    setTaken(true);
    setPlaying(false);
    setActive(next);
  }, []);

  const shown = steps[active] ?? steps[0];
  if (!shown) return null;

  return (
    <div ref={host} className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-14">
        {/*
          The chapters. Buttons, not tabs, because each one is a jump to a
          moment rather than a panel of its own — and because a reader who
          arrives mid-play needs the whole shape visible, not just the step
          that happens to be on.
        */}
        <ol className="flex flex-col">
          {steps.map((step, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <li key={step.key} className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-4">
                <div aria-hidden className="relative flex justify-center">
                  <span
                    className={`z-10 mt-[15px] size-2.5 shrink-0 rounded-full transition-colors ${
                      on ? 'bg-ink' : done ? 'bg-rule-strong' : 'bg-rule'
                    }`}
                  />
                  {i < steps.length - 1 && (
                    <span
                      className={`absolute bottom-0 left-1/2 top-6 w-px -translate-x-1/2 transition-colors ${
                        done ? 'bg-rule-strong' : 'bg-rule'
                      }`}
                    />
                  )}
                </div>
                <div className="border-b border-rule last:border-b-0">
                  <button
                    type="button"
                    onClick={() => take(i)}
                    aria-current={on ? 'step' : undefined}
                    className="flex w-full items-center gap-3 py-3.5 text-left"
                  >
                    <span
                      className={`flex-1 text-[16.5px] font-medium tracking-[-0.02em] transition-colors ${on ? 'text-ink' : 'text-ink-3'}`}
                    >
                      {step.label}
                    </span>
                    <span className="t-readout shrink-0 text-[10.5px] text-ink-3">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </button>
                  {on && (
                    <p className="anim-fade max-w-prose pb-4 pr-4 text-[13.5px] leading-relaxed text-ink-2">
                      {step.says}
                    </p>
                  )}
                  {/*
                    The progress of the step being played, drawn under the one
                    it belongs to. Absent when nothing is playing, so a paused
                    walkthrough does not look stalled.
                  */}
                  {on && playing && !still && !taken && (
                    <span aria-hidden className="mb-3 block h-px w-full overflow-hidden bg-rule">
                      <span className="walk-tick block h-px bg-ink" style={{ animationDuration: `${STEP_MS}ms` }} />
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <figure
            key={shown.key}
            className="anim-fade overflow-hidden rounded-[18px] border border-rule bg-raised shadow-lift"
          >
            <figcaption className="flex items-center justify-between gap-3 border-b border-rule bg-sunken/50 px-5 py-3">
              <span className="t-label">{shown.label}</span>
              <span className="t-readout text-[10.5px] text-ink-3">
                Job #{walk.job.jobId} · {walk.job.network}
              </span>
            </figcaption>
            <dl className="flex flex-col px-5">
              {shown.rows.map((row) => (
                <div
                  key={row.k}
                  className="flex flex-col gap-1 border-b border-rule py-3.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <dt className="t-label shrink-0">{row.k}</dt>
                  <dd className="flex min-w-0 items-center gap-2 text-[14px] leading-snug text-ink sm:text-right">
                    {row.tone && (
                      <span
                        aria-hidden
                        className={`size-1.5 shrink-0 rounded-full ${row.tone === 'ok' ? 'bg-ok' : row.tone === 'watch' ? 'bg-watch' : 'bg-rule-strong'}`}
                      />
                    )}
                    {row.href ? (
                      <a
                        href={row.href}
                        target={row.href.startsWith('http') ? '_blank' : undefined}
                        rel={row.href.startsWith('http') ? 'noreferrer noopener' : undefined}
                        className="t-readout min-w-0 truncate underline underline-offset-2 hover:text-ink"
                      >
                        {row.v}
                      </a>
                    ) : (
                      <span className="min-w-0">{row.v}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {shown.foot && (
              <p className="border-t border-rule bg-sunken/40 px-5 py-3.5 text-[12.5px] leading-relaxed text-ink-3">
                {shown.foot}
              </p>
            )}
          </figure>
        </div>
      </div>

      {/*
        What this was, said once and plainly. A walkthrough of a hire Pokter
        funded is a demonstration, not a customer, and the sentence that says
        so belongs under it rather than in a footnote nobody opens.
      */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-5 text-[13px] text-ink-3">
        <span>
          {walk.fundedByTeam
            ? `A real hire on ${walk.job.network}, funded by Pokter, not by a customer.`
            : `A real hire on ${walk.job.network}, funded from outside Pokter.`}{' '}
          Every figure above is read from it.
        </span>
        <Link href={walk.job.href} className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline">
          Open job #{walk.job.jobId} <Icon.Arrow size={14} />
        </Link>
      </p>
    </div>
  );
}
