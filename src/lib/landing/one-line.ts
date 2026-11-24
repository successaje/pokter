/**
 * One line, and a line that says something.
 *
 * Many catalogue descriptions open by restating their own registration —
 * "Yield agent (category: yield) on BNB Smart Chain testnet." — so a cut at
 * ninety characters spends the whole line on what the cell already shows.
 * The opening sentence is dropped when it is classification rather than
 * purpose, and what is left is cut at a clause or a word, never on a word
 * left dangling.
 */
const BOILERPLATE = /\(category:\s*[^)]+\)|^[\w\s-]{0,40}agent\b[^.]*\bon\s+bnb\b/i;
const DANGLING =
  /[\s,;:]+(?:a|an|the|and|or|but|of|for|on|in|to|with|that|which|where|when|while|if|into|about|over|under|after|before|than|through|from|by|at|as|per|using|given|its|their|this|these|it|is|are|was|were)$/i;

export function oneLine(text: string, cap = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const sentences = flat.split(/(?<=\.)\s+/);
  const kept = sentences.length > 1 && BOILERPLATE.test(sentences[0]!) ? sentences.slice(1) : sentences;
  const body = (kept.join(' ') || flat).trim();
  if (body.length <= cap) return body;
  const cut = body.slice(0, cap);
  const clause = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(': '));
  const word = cut.lastIndexOf(' ');
  const stop = clause > 44 ? clause : word > 40 ? word : cap;
  const line = cut
    .slice(0, stop)
    .replace(/[,.;:]$/, '')
    .replace(/\s+\S+['’]s$/, '')
    .replace(DANGLING, '');
  return `${line}…`;
}
