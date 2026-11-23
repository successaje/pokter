/*
 * The footer's top edge: where the page's paper turns into the yellow.
 *
 * Not a line but a dissolve, on the same 24px lattice the footer is ruled
 * in: squares of the yellow thick at the bottom, where they meet the block,
 * and thinning row by row toward the paper. Some of them come and go slowly,
 * and now and then a square appears for a moment in a gap, so the edge
 * moves on its own without anybody touching it. Seeded, so the server and
 * every visit draw the same edge.
 */

export const EDGE_CELL = 24;
export const EDGE_ROWS = 4;
/** Enough columns to cover a 2560px screen. */
export const EDGE_COLS = 107;

/** How full each row is, from the row touching the yellow upward. */
const DENSITY = [0.88, 0.52, 0.25, 0.09];
/** How likely a filled square is to fade and return, by row. */
const TWINKLE = [0.1, 0.28, 0.42, 0.55];
/** How likely an empty square is to flash in for a moment, by row; the bottom row has no gaps worth filling. */
const GHOST = [0, 0.1, 0.1, 0.07];

export interface EdgeSquare {
  col: number;
  /** 0 is the row touching the yellow. */
  row: number;
  /** `solid` stays; `twinkle` fades and returns; `ghost` is mostly absent and appears for a moment. */
  kind: 'solid' | 'twinkle' | 'ghost';
  /** Seconds per cycle, for the two that move. */
  duration: number;
  /** A negative start, so the edge is already moving when the page opens. */
  offset: number;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pixelEdge(seed = 56): EdgeSquare[] {
  const rand = seeded(seed);
  const squares: EdgeSquare[] = [];
  for (let row = 0; row < EDGE_ROWS; row++) {
    for (let col = 0; col < EDGE_COLS; col++) {
      const filled = rand() < DENSITY[row]!;
      const roll = rand();
      const duration = 5 + rand() * 7;
      const offset = -(rand() * 12);
      if (filled) squares.push({ col, row, kind: roll < TWINKLE[row]! ? 'twinkle' : 'solid', duration, offset });
      else if (roll < GHOST[row]!) squares.push({ col, row, kind: 'ghost', duration: duration + 2, offset });
    }
  }
  return squares;
}
