'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Number interpolation, explicitly on the sanctioned motion list.
 *
 * Counts to a real measured figure — never past it and never to a rounder one.
 * The final value is rendered as the initial server output, so a visitor with
 * JavaScript disabled or reduced motion enabled sees the true number
 * immediately rather than a zero that never animates.
 */
/**
 * How to render the interpolated value.
 *
 * A name rather than a function: formatters cannot cross the server/client
 * boundary, and passing one throws at render time rather than at build.
 */
export type CountFormat = 'compact' | 'count' | 'plain';

const FORMATTERS: Record<CountFormat, (value: number) => string> = {
  compact: (value) =>
    new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value),
  count: (value) => new Intl.NumberFormat('en-US').format(Math.round(value)),
  plain: (value) => String(Math.round(value)),
};

export function CountUp({
  value,
  format = 'count',
  durationMs = 1100,
}: {
  value: number;
  format?: CountFormat;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();

        const started = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - started) / durationMs);
          // Ease-out cubic: fast to roughly the right magnitude, then settles,
          // which reads as a figure resolving rather than a slot machine.
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(value * eased);
          if (progress < 1) frame = requestAnimationFrame(tick);
          else setDisplay(value);
        };

        setDisplay(0);
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className="tabular">
      {FORMATTERS[format](display)}
    </span>
  );
}
