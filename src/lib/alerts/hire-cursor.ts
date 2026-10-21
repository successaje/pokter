/**
 * Whether a hire watch may move its cursor past what it just read.
 *
 * The cursor is how the watch avoids re-reading the whole job counter every
 * run, and advancing it is a promise that everything behind it has been
 * dealt with. A deadline guard broke that promise: the alert could be
 * skipped for lack of time while the cursor advanced anyway, so the outside
 * hires it had just found were never looked at again. Not delayed — gone.
 *
 * So the cursor waits when there was something to say and nobody was told.
 * Nothing found means nothing owed, and the cursor advances as before.
 */
export function mayAdvanceHireCursor(input: {
  /** Hires from outside the team found in this window. */
  outsiders: number;
  /** Whether the alert about them actually went somewhere. */
  alerted: boolean;
}): boolean {
  if (input.outsiders === 0) return true;
  return input.alerted;
}
