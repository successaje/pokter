/**
 * Which agents lead on one measure of a comparison.
 *
 * Marked per row, never overall: being fastest says nothing about being
 * right, and the page does not declare a winner the evidence cannot
 * support. A row gets a leader only when at least two agents have a value
 * to compare and they are not all equal; agents with no value never lead,
 * and absent data is never read as zero. Ties share the mark.
 */
export function leaders(values: ReadonlyArray<number | null>, better: 'higher' | 'lower'): Set<number> {
  const present = values.flatMap((value, index) => (value === null || !Number.isFinite(value) ? [] : [{ value, index }]));
  if (present.length < 2) return new Set();
  const best = better === 'higher' ? Math.max(...present.map((p) => p.value)) : Math.min(...present.map((p) => p.value));
  const winners = present.filter((p) => p.value === best);
  if (winners.length === present.length) return new Set();
  return new Set(winners.map((p) => p.index));
}
