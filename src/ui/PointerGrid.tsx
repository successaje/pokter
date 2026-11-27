'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * Graph paper that answers the pointer.
 *
 * The sheet's blank paper, made to respond the way the page's subject does:
 * the squares the pointer crosses darken and fade like calls going out, and
 * a square it rests on for a moment answers, in the signal colour, and then
 * lets go. Nothing round the pointer is lit: a glow and a lens that showed
 * the lattice through were tried and taken out, the trail says enough. It is the same gesture in
 * the hero, behind the board's blank cells and in the footer, so the page
 * has one way of being alive rather than three.
 *
 * It listens on the nearest ancestor marked `data-grid-host` and never takes
 * a pointer event itself, so nothing under it stops being clickable. A
 * canvas carries the squares, drawn only while something is fading and
 * sized only once the pointer first arrives, so an idle page pays nothing.
 * Off entirely on touch screens, where there is no pointer to follow, and
 * under reduced motion.
 *
 * Colours come from the host: `--grid-trail` for the squares crossed and
 * `--grid-answer` for the one that answers, falling back to ink and signal.
 */

/** How long the pointer must rest on one square before it answers, in ms. */
const DWELL = 420;
/** How long an answer is held, in frames at 60fps. */
const ANSWER_LIFE = 96;

interface Lit {
  col: number;
  row: number;
  /** 0..1, decaying each frame for a trail square; frames left for an answer. */
  v: number;
  answer: boolean;
}

export function PointerGrid({ cell = 24, className, trailAlpha = 0.11, answerAlpha = 0.78 }: { cell?: number; className?: string; trailAlpha?: number; answerAlpha?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = root.current;
    const paint = canvas.current;
    const host = el?.closest<HTMLElement>('[data-grid-host]');
    if (!el || !paint || !host) return;
    const coarse = window.matchMedia('(pointer: coarse)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (coarse.matches || still.matches) return;

    const ctx = paint.getContext('2d');
    if (!ctx) return;
    const lit = new Map<string, Lit>();
    let frame = 0;
    let sized = false;
    let colours = { trail: '#16171a', answer: '#f0b90b' };
    let resting: { key: string; since: number } | null = null;
    let dwellTimer = 0;

    const size = () => {
      const rect = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      paint.width = Math.round(rect.width * dpr);
      paint.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sized = true;
    };
    const resize = new ResizeObserver(() => {
      if (sized) size();
    });
    resize.observe(el);

    const readColours = () => {
      const style = getComputedStyle(el);
      colours = {
        trail: style.getPropertyValue('--grid-trail').trim() || style.getPropertyValue('--ink').trim() || colours.trail,
        answer: style.getPropertyValue('--grid-answer').trim() || style.getPropertyValue('--signal').trim() || colours.answer,
      };
    };

    const draw = () => {
      frame = 0;
      ctx.clearRect(0, 0, paint.width, paint.height);
      for (const [key, square] of lit) {
        const x = square.col * cell + 1;
        const y = square.row * cell + 1;
        if (square.answer) {
          /* In quickly, held, out slowly: the shape of a reply. */
          const t = 1 - square.v / ANSWER_LIFE;
          const a = t < 0.12 ? t / 0.12 : t > 0.7 ? (1 - t) / 0.3 : 1;
          ctx.globalAlpha = a * answerAlpha;
          ctx.fillStyle = colours.answer;
          ctx.fillRect(x, y, cell - 1, cell - 1);
          square.v -= 1;
          if (square.v <= 0) lit.delete(key);
        } else {
          ctx.globalAlpha = square.v * trailAlpha;
          ctx.fillStyle = colours.trail;
          ctx.fillRect(x, y, cell - 1, cell - 1);
          square.v *= 0.9;
          if (square.v < 0.03) lit.delete(key);
        }
      }
      ctx.globalAlpha = 1;
      if (lit.size > 0) frame = requestAnimationFrame(draw);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const touch = (col: number, row: number, v: number) => {
      const key = `${col}:${row}`;
      const was = lit.get(key);
      if (was?.answer) return;
      if (!was || was.v < v) lit.set(key, { col, row, v, answer: false });
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (!sized) size();
      const col = Math.floor(x / cell);
      const row = Math.floor(y / cell);
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      touch(col, row, 1);
      /* A softer ring round it, so the trail has a width and not just a line. */
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) touch(col + dc, row + dr, 0.32);
      const key = `${col}:${row}`;
      if (resting?.key !== key) {
        resting = { key, since: performance.now() };
        window.clearTimeout(dwellTimer);
        dwellTimer = window.setTimeout(() => {
          lit.set(key, { col, row, v: ANSWER_LIFE, answer: true });
          wake();
        }, DWELL);
      }
      wake();
    };
    const onEnter = () => readColours();
    const onLeave = () => {
      resting = null;
      window.clearTimeout(dwellTimer);
    };

    host.addEventListener('pointerenter', onEnter);
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);
    return () => {
      host.removeEventListener('pointerenter', onEnter);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      resize.disconnect();
      window.clearTimeout(dwellTimer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [cell, trailAlpha, answerAlpha]);

  return (
    <div ref={root} aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <canvas ref={canvas} className="absolute inset-0 size-full" />
    </div>
  );
}
