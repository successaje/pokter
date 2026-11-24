'use client';

import { useEffect, useState } from 'react';

/**
 * The hero's headline. "Most agents never answer." leads on a line of its
 * own and stays: it is the finding the page is set on. The line under it
 * takes turns, starting with "These do." and moving on only after the
 * opening has drawn its rule, so the first thing read is the pair.
 *
 * Every line sits in the same grid cell and only one is shown, so the
 * headline holds its size as the lines change and nothing below it moves.
 * Assistive technology reads the headline once, as the pair; the turning is
 * for the eye. Without a script, or under reduced motion, it stays on the
 * first line.
 */

export const HERO_LINES = [
  { words: 'These do', end: '.' },
  { words: 'We check which', end: '.' },
  { words: 'Hire one that does', end: '.' },
] as const;

/** After the opening's rule lands (about 2.9 s) and a beat to read the pair. */
const FIRST_TURN = 4200;
const EVERY = 3400;

export function HeroHeadline() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let every = 0;
    const first = window.setTimeout(() => {
      setShown(1);
      every = window.setInterval(() => setShown((i) => (i + 1) % HERO_LINES.length), EVERY);
    }, FIRST_TURN);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);

  return (
    <h1 id="hero-title" className="t-display anim-rise" style={{ animationDelay: '60ms' }}>
      <span className="sr-only">Most agents never answer. These do.</span>
      <span aria-hidden className="block">
        Most agents never answer.
      </span>
      <span aria-hidden className="grid justify-items-center">
        {HERO_LINES.map((line, i) => (
          <span key={line.words} className="hero-line col-start-1 row-start-1 self-end text-balance" data-on={i === shown || undefined}>
            <span className="relative">
              {line.words}
              {/* The first line's rule is the one the opening draws; the others arrive with their line. */}
              <span
                data-hero-underline={i === 0 || undefined}
                className="absolute -bottom-1 left-0 h-[0.09em] w-full origin-left bg-signal"
                style={i === 0 ? { animation: 'rise 700ms var(--ease-out) 500ms both' } : undefined}
              />
            </span>
            {line.end}
          </span>
        ))}
      </span>
    </h1>
  );
}
