'use client';

import { useEffect, useRef, useState } from 'react';

import { Mark } from './Logo';

/**
 * The wordmark across the base of the footer, lit by a passing sweep.
 *
 * Set a shade off the background rather than in ink: at this size a
 * legible wordmark would be the loudest thing on the page and the last
 * thing read, which is the wrong order for a footer. The sweep is what
 * makes it register — a highlight crossing it once, not a glow sitting on
 * it. Only the dot keeps full colour, so the brand reads even at rest.
 *
 * It lights on entering view, on hover, and then every so often while it
 * stays in view. A loop that runs regardless would animate to nobody, in
 * the one region of a page most likely to be off screen.
 *
 * Under `prefers-reduced-motion` there is no sweep at all. The wordmark is
 * decoration, and decoration is the first thing a reader who asked for
 * stillness should stop being sent.
 */
const SWEEP_MS = 1500;
const REPEAT_MS = 9000;

export function FooterWordmark() {
  const host = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let repeat: number | undefined;
    let settle: number | undefined;
    const light = () => {
      setLit(true);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => setLit(false), SWEEP_MS);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          light();
          repeat = window.setInterval(light, REPEAT_MS);
        } else {
          window.clearInterval(repeat);
          repeat = undefined;
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    el.addEventListener('pointerenter', light);

    return () => {
      observer.disconnect();
      el.removeEventListener('pointerenter', light);
      window.clearInterval(repeat);
      window.clearTimeout(settle);
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden
      className="pointer-events-auto relative select-none overflow-hidden"
      /* Clipped at the baseline, so it sits in the page rather than on it. */
      style={{ height: 'clamp(76px, 18.5vw, 236px)' }}
    >
      <div className="frame flex h-full items-end gap-[2.5vw]">
        <Mark className="mb-[2%] h-[58%] w-auto text-rule-strong/40" />
        <span
          className={`wordmark-sweep t-display-mark select-none leading-[0.78] ${lit ? 'is-lit' : ''}`}
          style={{ fontSize: 'clamp(66px, 22.5vw, 286px)' }}
        >
          pokter
          <span className="wordmark-dot" />
        </span>
      </div>
    </div>
  );
}
