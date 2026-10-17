/**
 * Shorten text at a word boundary, and say that it was shortened.
 *
 * Profiles cut operator text with a bare `slice`, so a skill description
 * could stop mid-word with no sign anything was missing. A cut now ends on
 * the last whole word that fits and carries an ellipsis.
 */
export function clipAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const space = head.search(/\s\S*$/);
  // A single long token (a URL, a hash) has no word boundary to keep.
  const cut = space > max * 0.6 ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,;:.]+$/, '')}…`;
}
