'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { FIELD_CELL, FIELD_COLS } from '@/lib/landing/hero-field';

/**
 * The hero's opening, once per visit: Pokter checking, played out on the
 * paper the page is set on.
 *
 * A scan line in the signal colour crosses the field and the squares it
 * passes flash and fade, while a small log in the frame's corner types what
 * the checking has found so far, and the rule under "These do" is drawn
 * last. About two seconds, and the words never wait for it: the headline,
 * the lede and the search are there from the first frame, and the only
 * thing held back is the underline.
 *
 * It shows the act, not a proportion. Every square it touches flashes the
 * same way, because Pokter's own counts do not support a picture of most
 * calls going unanswered — two in three agents it has called have answered
 * at least once — and the registry is not the denominator of those calls,
 * so no part of the field stands for it. The log's two figures are one
 * scope, the record's own "Agents Pokter has called", read from the page.
 *
 * Plays once per browser session and never under reduced motion; then the
 * log is simply there and the underline draws as it always did. With no
 * script the log is there from the start.
 */

const SESSION_KEY = 'pokter:hero-intro';
/** The timeline, in ms from the moment it starts. */
const SWEEP_AT = 250;
const SWEEP_FOR = 1300;
const FLASH_FOR = 700;
const TYPE_FIRST_AT = 100;
const TYPE_SECOND_AT = 1450;
const UNDERLINE_AT = 1600;
const PER_CHAR = 22;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A few squares per column, the same ones every visit. */
function rowsFor(col: number, rows: number): number[] {
  let s = (col * 2654435761) >>> 0;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const count = 2 + Math.floor(next() * 4);
  return Array.from({ length: count }, () => Math.floor(next() * rows));
}

function shouldPlay(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.sessionStorage.getItem(SESSION_KEY)) return false;
    window.sessionStorage.setItem(SESSION_KEY, '1');
    return true;
  } catch {
    /* Storage refused: play it, once for this page view. */
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

/* Layout effect on the client, so an empty log is set before the first paint after hydration; a no-op on the server. */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function HeroIntro({ called, answered }: { called: number; answered: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const first = '> ask every agent we list';
  const second = `${called.toLocaleString('en-US')} called · ${answered.toLocaleString('en-US')} ever answered`;
  /* The server renders the finished log; a visit that plays the opening empties it before anything is painted. */
  const [typed, setTyped] = useState<[number, number]>([first.length, second.length]);
  const [live, setLive] = useState(false);
  /** True when the opening took the underline over, and so has to draw it. */
  const holding = useRef(false);
  /**
   * Whether this mount plays, decided once: the decision writes the session
   * flag, so asking again (React runs setup twice in development) would
   * read its own answer back as "already seen".
   */
  const plays = useRef<boolean | null>(null);

  useBeforePaint(() => {
    const section = canvas.current?.closest('section');
    const underline = section?.querySelector<HTMLElement>('[data-hero-underline]');
    if (plays.current === null) plays.current = shouldPlay();
    if (!plays.current) {
      /* Seen this visit: the underline need not wait for an opening that is not coming. */
      if (underline) underline.style.animationDelay = '300ms';
      return;
    }
    setTyped([0, 0]);
    setLive(true);
    /* Hold the underline for the last beat, unless it has already been drawn. */
    const drawn = underline?.getAnimations().some((a) => a.playState === 'finished' || Number(a.currentTime ?? 0) > 500) ?? true;
    if (underline && !drawn) {
      underline.style.animation = 'none';
      underline.style.transform = 'scaleX(0)';
      holding.current = true;
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const node = canvas.current;
    const section = node?.closest('section');
    const ctx = node?.getContext('2d');
    if (!node || !section || !ctx) return;

    const rect = section.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    node.width = Math.round(W * dpr);
    node.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const style = getComputedStyle(section);
    const ink = style.getPropertyValue('--ink').trim() || '#16171a';
    const signal = style.getPropertyValue('--signal').trim() || '#f0b90b';

    /* The field's lattice is centred on the section, so its squares are found from the same centre. */
    const left = W / 2 - (FIELD_COLS * FIELD_CELL + 1) / 2;
    const rows = Math.ceil(H / FIELD_CELL);
    const firstCol = Math.max(0, Math.floor(-left / FIELD_CELL));
    const lastCol = Math.min(FIELD_COLS - 1, Math.ceil((W - left) / FIELD_CELL));
    const fired = new Set<number>();
    const flashes: Array<{ x: number; y: number; at: number }> = [];

    const start = performance.now();
    const timers: number[] = [];
    let frame = 0;

    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      const p = Math.min(1, Math.max(0, (t - SWEEP_AT) / SWEEP_FOR));
      const x = -60 + easeInOut(p) * (W + 120);
      if (t >= SWEEP_AT && p < 1) {
        for (let col = firstCol; col <= lastCol; col++) {
          const cx = left + col * FIELD_CELL;
          if (fired.has(col) || cx > x) continue;
          fired.add(col);
          for (const row of rowsFor(col, rows)) flashes.push({ x: cx + 1, y: row * FIELD_CELL + 1, at: now });
        }
      }
      ctx.fillStyle = ink;
      for (const flash of flashes) {
        const age = (now - flash.at) / FLASH_FOR;
        if (age >= 1) continue;
        ctx.globalAlpha = 0.11 * (1 - age);
        ctx.fillRect(flash.x, flash.y, FIELD_CELL - 1, FIELD_CELL - 1);
      }
      if (t >= SWEEP_AT && p < 1) {
        /* The scan: a hairline of the signal, with a light trailing behind it. */
        const glow = ctx.createLinearGradient(x - 48, 0, x, 0);
        glow.addColorStop(0, 'transparent');
        glow.addColorStop(1, signal);
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = glow;
        ctx.fillRect(x - 48, 0, 48, H);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = signal;
        ctx.fillRect(x, 0, 1.5, H);
      }
      ctx.globalAlpha = 1;
      if (t < SWEEP_AT + SWEEP_FOR + FLASH_FOR) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, W, H);
    };
    frame = requestAnimationFrame(draw);

    /* The log types itself: the command while the sweep runs, the finding as it ends. */
    for (let i = 1; i <= first.length; i++) timers.push(window.setTimeout(() => setTyped(([, b]) => [i, b]), TYPE_FIRST_AT + i * PER_CHAR));
    for (let i = 1; i <= second.length; i++) timers.push(window.setTimeout(() => setTyped(([a]) => [a, i]), TYPE_SECOND_AT + i * PER_CHAR));

    const underline = section.querySelector<HTMLElement>('[data-hero-underline]');
    if (underline && holding.current) {
      timers.push(
        window.setTimeout(() => {
          underline.style.transition = 'transform 700ms var(--ease-out)';
          underline.style.transform = 'scaleX(1)';
        }, UNDERLINE_AT),
      );
    }

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [live, first, second]);

  const done = typed[0] === first.length && typed[1] === second.length;

  return (
    <>
      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full [mask-image:linear-gradient(to_bottom,black_62%,transparent)]" />
      {/*
        The log, in the frame's top-left corner on wide screens: what the
        checking has found, in the record's own scope. Read once to
        assistive technology as a sentence; the typing is for the eye.
      */}
      <div className="frame pointer-events-none absolute inset-x-0 top-0 hidden lg:block">
        <p className="sr-only">
          Pokter has called {called.toLocaleString('en-US')} agents; {answered.toLocaleString('en-US')} have ever answered.
        </p>
        <div aria-hidden className="t-readout mt-7 flex flex-col gap-1.5 text-[11.5px] leading-none">
          <span className="text-ink-3">
            {first.slice(0, typed[0])}
            {!done && typed[1] === 0 && <span className="hero-caret" />}
          </span>
          <span className="min-h-[1em] text-ink-2">
            {second.slice(0, typed[1])}
            {(typed[1] > 0 || done) && <span className="hero-caret" />}
          </span>
        </div>
      </div>
    </>
  );
}
