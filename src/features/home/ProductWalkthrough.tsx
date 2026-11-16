'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Chrome, SCENES } from '@/features/home/WalkthroughScenes';
import type { Shelf, Walkthrough } from '@/features/home/walkthrough-data';
import { Icon } from '@/ui/icons';

/**
 * One real hire, played as a film of the product, with its chapters under it.
 *
 * The page has to answer "what is it actually like to hire one of these"
 * before it asks anybody to try, and the honest answer is the screens. So
 * this plays them: a window, the five routes a hire passes through, and a
 * cursor that moves to the thing it is about to press, presses it, and the
 * screen does what the screen does. What a reader watches being clicked is
 * what they would click.
 *
 * It is a reconstruction, not a recording, and `WalkthroughScenes` carries
 * the argument for that and the rule it keeps: every value on every screen
 * is read from job #1733, and a field the job did not carry is shown as
 * missing rather than filled in. The caveats that belong to each step are
 * under the film, not buried in it, because a film is watched and a caveat
 * has to be read.
 *
 * It plays once on its own when first scrolled to. Touching a chapter stops
 * it running on to the next one — a reader studying step three does not
 * want step four arriving over it — but lets that chapter finish, which is
 * what a reader who clicked it was asking for. The play control gives the
 * run of the whole thing back.
 *
 * Under `prefers-reduced-motion` nothing moves: there is no cursor, every
 * screen is resolved, and the chapters are a set of buttons. That is the
 * same content without the timing, not a lesser version of it.
 */

/** Long enough to read a line, short enough that five chapters are not a sit-down. */
const BEAT_MS = 1250;
/** The pause on a finished chapter before the next one starts. */
const TURN_MS = 1500;

export function ProductWalkthrough({ walk, shelf }: { walk: Walkthrough; shelf: Shelf | null }) {
  const steps = walk.steps;
  const [scene, setScene] = useState(0);
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** Whether a finished chapter runs on into the next. Off as soon as a reader steers. */
  const [auto, setAuto] = useState(true);
  const [still, setStill] = useState(false);
  const host = useRef<HTMLDivElement>(null);

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
    if (!node || still) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        seen.disconnect();
        setPlaying(true);
      },
      { threshold: 0.3 },
    );
    seen.observe(node);
    return () => seen.disconnect();
  }, [still]);

  const step = steps[scene];
  const key = step?.key;
  const beats = key ? SCENES[key].beats : [];
  const last = beats.length - 1;

  useEffect(() => {
    if (!playing || still || !key) return;
    if (beat < last) {
      const timer = window.setTimeout(() => setBeat((at) => at + 1), BEAT_MS);
      return () => window.clearTimeout(timer);
    }
    /* Chapter over. Run on only if nobody has steered, and never past the end. */
    if (!auto || scene >= steps.length - 1) {
      const timer = window.setTimeout(() => setPlaying(false), TURN_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setScene((at) => at + 1);
      setBeat(0);
    }, TURN_MS);
    return () => window.clearTimeout(timer);
  }, [playing, still, key, beat, last, auto, scene, steps.length]);

  /** A reader steering: go there, play that chapter, stop running on. */
  const seek = useCallback((next: number) => {
    setAuto(false);
    setScene(Math.max(0, Math.min(next, steps.length - 1)));
    setBeat(0);
    setPlaying(true);
  }, [steps.length]);

  const toggle = useCallback(() => {
    setPlaying((was) => {
      if (was) return false;
      /* Starting it again is asking for the whole thing, from here. */
      setAuto(true);
      setBeat(0);
      return true;
    });
  }, []);

  if (!step || !key) return null;
  const { Body } = SCENES[key];
  const shown = still ? last : beat;
  const spot = beats[Math.min(shown, last)] ?? { x: 50, y: 50 };

  return (
    <div ref={host} className="flex flex-col">
      {/* ── the film ── */}
      <div className="relative mx-auto w-full max-w-[60rem]">
        <div className="relative h-[30rem] overflow-hidden rounded-[16px] border border-rule bg-raised shadow-lift sm:h-[34rem] lg:h-[36rem]">
          <Chrome path={walk.scene.paths[key]}>
            {/*
              Keyed on the chapter so each screen arrives rather than
              morphing out of the last one: the routes are different pages
              and a cross-fade between them would be a lie about navigation.
            */}
            <div key={key} className="anim-fade h-full">
              <Body walk={walk} shelf={shelf} beat={shown} />
            </div>
          </Chrome>

          {/*
            The cursor. Absent entirely under reduced motion, and `aria-hidden`
            always: it is a drawing of a pointer, and a screen reader already
            has the screen it is pointing at.
          */}
          {!still && (
            <span
              aria-hidden
              className="pointer-events-none absolute z-20 transition-[left,top] duration-[650ms] ease-[cubic-bezier(.33,.9,.32,1)]"
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            >
              {spot.click && (
                <span
                  key={`${key}-${shown}`}
                  className="walk-press absolute -left-3 -top-3 block size-6 rounded-full border-2 border-ink"
                />
              )}
              <svg viewBox="0 0 12 18" width={16} height={24} className="block drop-shadow-sm">
                <path
                  d="M1 1l10 7.1-4.3.8 2.6 5.4-2.4 1.1-2.6-5.4L1 13.2z"
                  fill="var(--ink)"
                  stroke="var(--paper)"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* ── the chapters, under the film ── */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Walkthrough chapters">
        <button
          type="button"
          onClick={() => seek(scene - 1)}
          disabled={scene === 0}
          className="grid size-8 shrink-0 place-items-center rounded-full border border-rule text-ink-3 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-30 disabled:hover:border-rule disabled:hover:text-ink-3"
        >
          <span className="sr-only">Previous chapter</span>
          <Icon.ChevronLeft size={14} />
        </button>

        {steps.map((s, i) => {
          const on = i === scene;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => seek(i)}
              aria-current={on ? 'step' : undefined}
              className={`relative overflow-hidden rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                on ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-2 hover:border-ink-3 hover:text-ink'
              }`}
            >
              {/*
                How far through this chapter the film is, drawn inside the
                chapter it belongs to. Absent when nothing is playing, so a
                paused walkthrough does not look stalled.
              */}
              {on && playing && !still && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-paper/30">
                  <span
                    className="block h-full bg-signal transition-[width] duration-300 ease-linear"
                    style={{ width: `${((beat + 1) / beats.length) * 100}%` }}
                  />
                </span>
              )}
              <span className="relative">{s.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => seek(scene + 1)}
          disabled={scene === steps.length - 1}
          className="grid size-8 shrink-0 place-items-center rounded-full border border-rule text-ink-3 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-30 disabled:hover:border-rule disabled:hover:text-ink-3"
        >
          <span className="sr-only">Next chapter</span>
          <Icon.ChevronRight size={14} />
        </button>

        {!still && (
          <button
            type="button"
            onClick={toggle}
            aria-pressed={playing}
            className="ml-1 grid size-8 shrink-0 place-items-center rounded-full border border-rule text-ink-3 transition-colors hover:border-ink-3 hover:text-ink"
          >
            <span className="sr-only">{playing ? 'Pause the walkthrough' : 'Play the walkthrough'}</span>
            {playing ? (
              <span aria-hidden className="flex gap-[2px]">
                <span className="block h-2.5 w-[2px] bg-current" />
                <span className="block h-2.5 w-[2px] bg-current" />
              </span>
            ) : (
              <Icon.Play size={12} />
            )}
          </button>
        )}
      </div>

      {/* ── what the chapter on screen actually was ── */}
      <div className="mx-auto mt-8 w-full max-w-[64rem]">
        <div key={`says-${key}`} className="anim-fade grid grid-cols-1 gap-x-10 gap-y-5 border-t border-rule pt-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2.5">
              <span className="t-readout text-[11px] text-ink-3">{String(scene + 1).padStart(2, '0')}</span>
              <span className="text-[17px] font-medium tracking-[-0.02em] text-ink">{step.label}</span>
            </p>
            <p className="max-w-prose text-[14px] leading-relaxed text-ink-2">{step.says}</p>
            {step.foot && (
              <p className="mt-1 max-w-prose border-l-2 border-rule pl-3 text-[12.5px] leading-relaxed text-ink-3">
                {step.foot}
              </p>
            )}
          </div>

          {/*
            The figures behind the screen above, so the film can be checked
            rather than only watched. Every one is read from the job.
          */}
          <dl className="flex flex-col rounded-[14px] border border-rule bg-raised px-4">
            {step.rows.map((row) => (
              <div
                key={row.k}
                className="flex flex-col gap-1 border-b border-rule py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <dt className="t-label shrink-0">{row.k}</dt>
                <dd className="flex min-w-0 items-center gap-2 text-[13.5px] leading-snug text-ink sm:text-right">
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
        </div>

        {/*
          What this was, said once and plainly. A walkthrough of a hire Pokter
          funded is a demonstration, not a customer, and the sentence that says
          so belongs under it rather than in a footnote nobody opens.
        */}
        <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-3">
          <span>
            {walk.fundedByTeam
              ? `Screens rebuilt from one real hire on ${walk.job.network}, funded by Pokter, not by a customer.`
              : `Screens rebuilt from one real hire on ${walk.job.network}, funded from outside Pokter.`}{' '}
            Every figure in them is read from it.
          </span>
          <Link href={walk.job.href} className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline">
            Open job #{walk.job.jobId} <Icon.Arrow size={14} />
          </Link>
        </p>
      </div>
    </div>
  );
}
