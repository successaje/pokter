/**
 * `1 probe`, `2 probes`.
 *
 * FE-16. `probe(s)` reads like a form field rather than a sentence, and the
 * product spends most of its words asking to be taken seriously about counts.
 * Irregular plurals take an explicit second argument rather than guessing.
 */
export function plural(count: number, noun: string, plural?: string): string {
  return `${count} ${count === 1 ? noun : (plural ?? `${noun}s`)}`;
}

/** The noun alone, without the count in front of it. */
export function pluralise(count: number, noun: string, plural?: string): string {
  return count === 1 ? noun : (plural ?? `${noun}s`);
}
