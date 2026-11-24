'use client';

import { useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/**
 * A count that runs up to itself the first time it is seen.
 *
 * The server renders the real figure, so the page reads correctly with no
 * script, in a screenshot and to a crawler. The run only starts once the
 * figure is on screen, and never under reduced motion; it eases out, so the
 * last digits settle rather than stop.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const [shown, setShown] = useState(value);
  const ran = useRef(false);

  useEffect(() => {
    if (!seen || ran.current) return;
    ran.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const from = performance.now();
    const span = 1100;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - from) / span);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, value]);

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString('en-US')}
    </span>
  );
}
