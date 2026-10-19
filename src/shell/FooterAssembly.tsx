'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The band across the base of the footer: the Pokter mark, and a quiet
 * field of tiles that delivers its centre.
 *
 * Decoration, and only that. No tile here is a reading of anything — not
 * an agent, not a job, not a probe — and none should ever be wired to
 * one. Where this product animates a measurement it says what the
 * measurement is; `ProbeStrip` carries a role and a label, and the
 * distance between that and this is deliberate.
 *
 * It replaces a "pokter." set at 286px, which was the loudest thing on
 * the page in the place a reader arrives at last.
 *
 * **One SVG, one coordinate system.** The gates, the tile field and the
 * travelling tile are all drawn in the same user units, so the tile docks
 * on the logo's centre by arithmetic rather than by tuning: the thing
 * that travels *is* `Logo.tsx`'s `rect x=400 y=290 w=183 h=182 rx=36`,
 * the same element, so its final size, radius and position cannot drift
 * from the real one. There is no second tile to swap in and nothing to
 * line up by eye.
 *
 * The viewBox width is measured rather than fixed. With it set to
 * `712 × width / height`, `xMinYMid meet` resolves to a scale of exactly
 * `height / 712`: the band fills its box at any aspect without cropping
 * the mark or letterboxing the field. Spacing is then specified in pixels
 * and converted, so the tiles stay the same physical size on a phone as
 * on a desktop instead of turning into grit.
 */

/* The logo's own box, from `Logo.tsx`, inside a view box with room above
   and below it so the mark breathes rather than filling the band edge to
   edge. */
const LOGO_X = 150;
const LOGO_RIGHT = 832;
const VB_Y = 8;
const VB_H = 800;
/* Its centre tile, which is what the travelling tile becomes. */
const PROOF = { x: 400, y: 290, w: 183, h: 182, rx: 36 } as const;

const TILE_PX = 13;
const GAP_PX = 30;
const ROWS = 5;

/** Stable across server and client: `Math.random` here is a hydration mismatch. */
function noise(i: number, salt: number): number {
  const x = Math.sin(i * 41.17 + salt * 289.31) * 19237.713;
  return x - Math.floor(x);
}

/**
 * Every number that reaches the DOM goes through here first.
 *
 * `Math.sin` is not bit-identical between Node and a browser engine, so
 * the same seed produced `-18.902238530736213` on the server and
 * `-18.902238531127296` on the client: different strings, and React
 * reports the whole subtree as a hydration mismatch. Two decimal places
 * is far below a pixel at any size this renders and puts both ends on the
 * same value.
 */
function q(value: number, dp = 2): number {
  return Number(value.toFixed(dp));
}

interface Tile {
  x: number;
  y: number;
  size: number;
  opacity: number;
  dx: number;
  dy: number;
  nx: number;
  ny: number;
  delay: number;
}

export function FooterAssembly() {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, h: 160 });
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const resize = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      if (r.width > 0 && r.height > 0) setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    resize.observe(el);
    /* Nothing animates to an empty viewport, or to a tab nobody is looking
       at, at the bottom of a long page where this sits most of the time. */
    const seen = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.15 });
    seen.observe(el);
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      resize.disconnect();
      seen.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const { vbW, tiles, travel } = useMemo(() => {
    const width = Math.round(VB_H * (box.w / Math.max(box.h, 1)));
    const perPx = VB_H / Math.max(box.h, 1);
    const size = TILE_PX * perPx;
    const step = (TILE_PX + GAP_PX) * perPx;
    /* The field starts clear of the mark and stops short of the edge, so
       no tile is ever cut in half by the viewport. */
    const from = LOGO_RIGHT + step;
    const to = LOGO_X + width - size;
    const cols = Math.max(0, Math.floor((to - from) / step) + 1);
    const midY = VB_Y + VB_H / 2;
    const out: Tile[] = [];
    let i = 0;
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        i += 1;
        const x = from + c * step + (noise(i, 1) - 0.5) * step * 0.18;
        const y = midY + (r - (ROWS - 1) / 2) * step + (noise(i, 2) - 0.5) * step * 0.18;
        /* The nudge fires as the tile passes, so its delay is where this
           one sits along the path rather than a number per tile. */
        const progress = (x - PROOF.x) / Math.max(from + (cols - 1) * step - PROOF.x, 1);
        out.push({
          x: q(x),
          y: q(y),
          size: q(size),
          opacity: q(0.2 + noise(i, 3) * 0.3, 3),
          dx: q((noise(i, 4) - 0.5) * step * 2.2),
          dy: q((noise(i, 5) - 0.5) * step * 1.6),
          nx: q(step * (0.28 + noise(i, 6) * 0.3)),
          ny: q((noise(i, 7) - 0.5) * step * 0.5),
          delay: q(TRAVEL_START + (1 - progress) * TRAVEL_SECONDS),
        });
      }
    }
    return { vbW: width, tiles: out, travel: q(from + (cols - 1) * step - PROOF.x) };
  }, [box.w, box.h]);

  const running = inView && tabVisible && !paused;

  return (
    <div className="relative">
      <div
        className={`fa-band ${running ? '' : 'is-still'}`}
        style={{ height: 'clamp(84px, 15vw, 190px)' }}
      >
        {/* Inside the page's gutter, so the mark lines up with the columns
            above it instead of sitting against the viewport edge. */}
        <div ref={host} className="frame h-full">
        <svg
          className="h-full w-full"
          viewBox={`${LOGO_X} ${VB_Y} ${vbW} ${VB_H}`}
          preserveAspectRatio="xMinYMid meet"
          role="img"
          aria-label="Pokter"
        >
          <g aria-hidden>
            {tiles.map((tile, i) => (
              <g
                key={i}
                className="fa-drift"
                style={{ ['--dx' as string]: `${tile.dx}px`, ['--dy' as string]: `${tile.dy}px` }}
              >
                <rect
                  className="fa-nudge"
                  x={tile.x}
                  y={tile.y}
                  width={tile.size}
                  height={tile.size}
                  rx={q(tile.size * 0.28)}
                  style={{
                    opacity: tile.opacity,
                    animationDelay: `${tile.delay}s`,
                    ['--nx' as string]: `${tile.nx}px`,
                    ['--ny' as string]: `${tile.ny}px`,
                  }}
                />
              </g>
            ))}
          </g>
          <g className="fa-pulse">
            <path
              fill="currentColor"
              d="M192 62H513Q545 62 545 94V168Q545 200 513 200H344Q332 200 332 212V752H192Q160 752 160 720V94Q160 62 192 62Z"
            />
            <path
              fill="currentColor"
              d="M592 62H716Q820 62 820 166V546Q820 648 716 648H457Q425 648 425 616V562Q425 530 457 530H640Q652 530 652 518V258Q652 246 640 246H592Z"
            />
            {/* The travelling tile and the logo's centre are one element. */}
            <rect
              className="fa-proof"
              x={PROOF.x}
              y={PROOF.y}
              width={PROOF.w}
              height={PROOF.h}
              rx={PROOF.rx}
              fill="var(--signal)"
              style={{ ['--travel' as string]: `${Math.max(travel, 0)}px` }}
            />
          </g>
        </svg>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        className="absolute bottom-1 right-4 rounded-[6px] px-2 py-1 text-[11px] text-ink-3 opacity-0 transition-opacity hover:bg-sunken hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink group-hover/footer:opacity-100 sm:right-6"
      >
        {paused ? 'Play animation' : 'Pause animation'}
      </button>
    </div>
  );
}

/* Shared with the keyframes in `globals.css`: the tile appears at 3.3s of
   an 11s loop and docks at 7.2s. A tile's nudge is timed off these. */
const TRAVEL_START = 3.3;
const TRAVEL_SECONDS = 3.9;
