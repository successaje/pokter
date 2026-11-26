'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * Scout: Pokter's mark, looking back at you.
 *
 * Built out of the logo rather than invented beside it. The mark is two
 * opposing gates with the yellow proof tile crossing their threshold; Scout
 * is the same three pieces, the tile as a face and the gates as hands
 * gripping the edge it looks over. Two colours from the palette, nothing
 * drawn that is not already in the logo.
 *
 * It watches, because that is what Pokter does for agents: its eyes follow
 * the pointer while the pointer is near, and settle back to looking ahead
 * when it is not, so a figure in the corner of every page does not tug at
 * the eye while someone reads. While Scout is reading Pokter's records it
 * sweeps, left to right.
 *
 * Moves by direct style writes in a requestAnimationFrame loop that runs
 * only while something is moving, never through React state, so an idle
 * page pays nothing for it. Decorative (`aria-hidden`); under reduced motion
 * it neither tracks nor blinks.
 */

export type ScoutMood = 'watching' | 'met' | 'reading';

/** How far a pupil may travel from centre, in viewBox units. */
const REACH = 5.5;

export function ScoutFigure({
  mood = 'watching',
  size = 128,
  near = 560,
  className,
}: {
  mood?: ScoutMood;
  /** Width in pixels; the height follows the figure's proportions. */
  size?: number;
  /** How close, in pixels, the pointer must come before the eyes follow it. */
  near?: number;
  className?: string;
}) {
  const host = useRef<SVGSVGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const lids = useRef<SVGGElement>(null);
  /* Read in the loop rather than closed over, so a mood change needs no re-subscribe. */
  const want = useRef<ScoutMood>(mood);
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    const svg = host.current;
    const pupils = eyes.current;
    const lid = lids.current;
    if (!svg || !pupils || !lid) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let x = 0;
    let y = 0;
    let toX = 0;
    let toY = 0;
    let blink = 0;
    let frame = 0;
    let blinkTimer = 0;

    const tick = (now: number) => {
      const m = want.current;
      if (m === 'met') {
        toX = 0;
        toY = 0;
      } else if (m === 'reading') {
        toX = Math.sin(now / 420) * REACH;
        toY = REACH * 0.35;
      }
      x += (toX - x) * 0.14;
      y += (toY - y) * 0.14;
      pupils.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      if (blink > 0) {
        blink = Math.max(0, blink - 0.16);
        lid.style.transform = `scaleY(${(1 - Math.sin(blink * Math.PI)).toFixed(3)})`;
      }
      const settled = Math.abs(toX - x) < 0.02 && Math.abs(toY - y) < 0.02 && blink === 0;
      frame = settled && m !== 'reading' ? 0 : requestAnimationFrame(tick);
    };
    const run = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    wake.current = run;

    const aim = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const box = svg.getBoundingClientRect();
      if (!box.width) return;
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height * 0.42);
      const far = Math.hypot(dx, dy) || 1;
      if (far > near) {
        /* Out of reach: look ahead again rather than stare across the page. */
        toX = 0;
        toY = 0;
      } else {
        /*
         * Clamped by distance, not by axis: a pointer far to one side pins
         * the eye to the edge of its travel, a pointer close by moves it in
         * proportion. Clamping each axis makes the pupil crawl a square.
         */
        const pull = Math.min(1, far / 220);
        toX = (dx / far) * REACH * pull;
        toY = (dy / far) * REACH * pull;
      }
      run();
    };
    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        if (!document.hidden) {
          blink = 1;
          run();
        }
        scheduleBlink();
      }, 3200 + Math.random() * 4800);
    };

    window.addEventListener('pointermove', aim, { passive: true });
    scheduleBlink();
    return () => {
      window.removeEventListener('pointermove', aim);
      window.clearTimeout(blinkTimer);
      cancelAnimationFrame(frame);
      wake.current = () => {};
    };
  }, [near]);

  useEffect(() => {
    want.current = mood;
    wake.current();
  }, [mood]);

  const met = mood === 'met';

  return (
    <svg
      ref={host}
      width={size}
      height={(size * 86) / 128}
      viewBox="0 0 128 86"
      aria-hidden
      focusable={false}
      className={cn('block overflow-visible', className)}
    >
      {/* The two gates, as hands over the edge: the mark's opposing gates, shortened. */}
      <path d="M10 86V40Q10 30 20 30H34Q40 30 40 36V44Q40 50 34 50H26Q24 50 24 52V86Z" fill="var(--ink)" />
      <path d="M118 86V40Q118 30 108 30H94Q88 30 88 36V44Q88 50 94 50H102Q104 50 104 52V86Z" fill="var(--ink)" />
      {/* The proof tile, as a face. Always the signal yellow, as in the mark. */}
      <rect x="32" y="16" width="64" height="70" rx="16" fill="var(--signal)" />
      <g ref={lids} style={{ transformOrigin: '64px 50px', transformBox: 'fill-box' }}>
        <g ref={eyes}>
          {/* Eyes open a little wider when it is being looked at rather than looking. */}
          {[44, 72].map((x) => (
            <rect
              key={x}
              x={x}
              y={met ? 42 : 44}
              width="12"
              height={met ? 18 : 14}
              rx="6"
              fill="var(--signal-ink)"
              style={{ transition: 'y 200ms var(--ease-out), height 200ms var(--ease-out)' }}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
