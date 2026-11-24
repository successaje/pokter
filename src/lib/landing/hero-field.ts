/*
 * The hero's field: which squares of the graph paper light up, and how.
 *
 * Texture, not a chart. No cell stands for any agent and no proportion is
 * drawn, so the field carries no label and claims nothing; the record is
 * counted further down the page. Laid out on a fixed 24px lattice centred
 * on the page, so the cells sit in the paper's squares at any width, and
 * seeded, so the server and every visit draw the same field.
 */

export const FIELD_COLS = 62;
/** Tall enough for a first screen of 960px; the hero is the whole first screen now. */
export const FIELD_ROWS = 40;
export const FIELD_CELL = 24;
export const FIELD_SIZE = 46;
/** At most this many hold in the signal colour; the rest flash and go dark. */
export const FIELD_ANSWERED = 7;

export interface FieldCell {
  col: number;
  row: number;
  answered: boolean;
  /** Seconds per cycle. */
  duration: number;
  /** A negative start, so the field is already mid-cycle when the page opens. */
  offset: number;
}

/**
 * The middle of the field is where the words are: no cell lands there. The
 * words are centred in a first screen of any height, so the zone runs the
 * column's whole height below the top two rows.
 */
export function inTextZone(col: number, row: number): boolean {
  return col > 12 && col < 49 && row > 1;
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

export function heroFieldCells(seed = 8004): FieldCell[] {
  const rand = seeded(seed);
  const cells: FieldCell[] = [];
  const taken = new Set<string>();
  let answered = 0;
  for (let guard = 0; cells.length < FIELD_SIZE && guard < 2000; guard++) {
    const col = Math.floor(rand() * FIELD_COLS);
    const row = Math.floor(rand() * FIELD_ROWS);
    if (inTextZone(col, row) || taken.has(`${col}:${row}`)) continue;
    taken.add(`${col}:${row}`);
    const holds = answered < FIELD_ANSWERED && rand() < 0.18;
    if (holds) answered += 1;
    cells.push({
      col,
      row,
      answered: holds,
      duration: holds ? 9 + rand() * 6 : 5 + rand() * 7,
      offset: -(rand() * 12),
    });
  }
  return cells;
}
