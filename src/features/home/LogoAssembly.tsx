'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Tiles that drift, settle into the Pokter mark, hold, and drift apart.
 *
 * Decoration, and only that. It is not a reading of anything: no agent,
 * no job and no sweep is behind a single tile, and nothing here should
 * ever be wired to one. Everywhere this product animates a measurement it
 * says what the measurement is — `ProbeStrip` has a role and a label —
 * and the distance between those two things is the point.
 *
 * The grid is the real mark, sampled from the two gate paths in
 * `shell/Logo.tsx` with `Path2D.isPointInPath` at 14 columns, so the
 * shape is the logo's own geometry rather than an impression of it. `#`
 * is a gate; `+` is the proof tile between them, carried at a lower
 * opacity because on a yellow ground its own yellow would disappear and a
 * full-strength charcoal would fill the mark's counter.
 */
const MARK = [
  '########.####.',
  '########.#####',
  '########.#####',
  '####.....#####',
  '####......####',
  '####.++++.####',
  '####.++++.####',
  '####.++++.####',
  '####.++++.####',
  '####......####',
  '####..########',
  '####..#######.',
  '####..........',
  '####..........',
] as const;

const COLS = MARK[0].length;
const ROWS = MARK.length;

/* Stable across server and client, unlike Math.random: a scatter drawn
   twice differently is a hydration mismatch. */
function noise(i: number, salt: number): number {
  const x = Math.sin(i * 41.17 + salt * 289.31) * 19237.713;
  return x - Math.floor(x);
}

/* Three curves, assigned round-robin, so tiles do not all land on the
   same frame. A per-tile delay would phase-shift the loop instead and
   break the assembly into a shimmer. */
const EASES = [
  'cubic-bezier(0.33, 0, 0.12, 1)',
  'cubic-bezier(0.45, 0, 0.2, 1)',
  'cubic-bezier(0.25, 0, 0.18, 1)',
] as const;

interface Tile {
  left: string;
  top: string;
  signal: boolean;
  dx: string;
  dy: string;
  rotate: string;
  ease: string;
}

const TILES: Tile[] = (() => {
  const out: Tile[] = [];
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = MARK[r][c];
      if (cell === '.') continue;
      i += 1;
      /*
       * Scattered outwards from the mark's middle, so the drift reads as
       * the tiles coming apart rather than sliding in from one side.
       */
      const outX = (c - (COLS - 1) / 2) / COLS;
      const outY = (r - (ROWS - 1) / 2) / ROWS;
      const spread = 180 + noise(i, 1) * 190;
      out.push({
        left: `${(c / COLS) * 100}%`,
        top: `${(r / ROWS) * 100}%`,
        signal: cell === '+',
        dx: `${(outX * spread + (noise(i, 2) - 0.5) * 70).toFixed(1)}%`,
        dy: `${(outY * spread + (noise(i, 3) - 0.5) * 70).toFixed(1)}%`,
        rotate: `${((noise(i, 4) - 0.5) * 38).toFixed(1)}deg`,
        ease: EASES[i % EASES.length],
      });
    }
  }
  return out;
})();

export function LogoAssembly({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);

  /*
   * Paused off screen. 142 tiles animating to an empty viewport is work
   * nobody sees, at the bottom of a long page where this sits most of the
   * time.
   */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={host} aria-hidden className={className}>
      {/* Square, so the mark keeps its proportions at any width. */}
      <div className="relative h-full w-full">
        <div className="absolute inset-0 m-auto aspect-square max-h-full max-w-full">
          {TILES.map((tile, i) => (
            <span
              key={i}
              className={`logo-tile absolute ${running ? 'is-running' : ''}`}
              style={{
                left: tile.left,
                top: tile.top,
                /* A gutter, so the mark reads as tiles rather than a silhouette. */
                width: `calc(${100 / COLS}% - 3px)`,
                height: `calc(${100 / ROWS}% - 3px)`,
                ['--dx' as string]: tile.dx,
                ['--dy' as string]: tile.dy,
                ['--r' as string]: tile.rotate,
                animationTimingFunction: tile.ease,
                opacity: tile.signal ? 0.26 : 0.62,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
