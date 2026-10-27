/**
 * Matching an agent by its name, the way a person types one.
 *
 * Discover read every query as a task description: words under three
 * letters were dropped and the rest matched anywhere in the name or the
 * description, so "B" found nothing and an exact name ranked no higher
 * than a passing mention. A name match now ranks by how much of the name
 * the person typed: the whole name, its start, the start of one of its
 * words, then anywhere in it.
 */

export const NAME_MATCH = { none: 0, contains: 1, wordStart: 2, start: 3, exact: 4 } as const;

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function nameMatch(name: string, query: string): number {
  const n = normalise(name);
  const q = normalise(query);
  if (!q || !n) return NAME_MATCH.none;
  if (n === q) return NAME_MATCH.exact;
  if (n.startsWith(q)) return NAME_MATCH.start;
  if (n.split(' ').some((word) => word.startsWith(q))) return NAME_MATCH.wordStart;
  if (q.length >= 3 && n.replace(/ /g, '').includes(q.replace(/ /g, ''))) return NAME_MATCH.contains;
  return NAME_MATCH.none;
}

/**
 * A query that is an agent's ID: "342378", "#342378", "56/342378" or
 * "97:2618". The chain is null when not given. Anything else is null, so a
 * number inside a task ("health factor above 1.5") is never read as an ID.
 */
export function parseAgentId(query: string): { chainId: 56 | 97 | null; tokenId: string } | null {
  const m = /^\s*(?:(56|97)\s*[/:]\s*)?#?(\d{1,12})\s*$/.exec(query);
  if (!m) return null;
  return { chainId: m[1] ? (Number(m[1]) as 56 | 97) : null, tokenId: String(BigInt(m[2])) };
}

/**
 * Where agents found by name in the registry go among the pool's matches.
 *
 * An exact match for the whole name leads, whatever the words look like:
 * "BSC Yield Router" is a name before it is a yield task, and was found
 * behind some thirty yield agents. The rest keep their place: after the
 * pool's matches when the query reads as a task Pokter recognises (loose
 * name matches for task words are not doing that task), before them when
 * it does not (then the query is most likely a name).
 */
export function placeNameMatches<T>(pool: T[], byName: T[], options: { nameOf: (item: T) => string; query: string; taskRecognised: boolean }): T[] {
  const exact = byName.filter((item) => nameMatch(options.nameOf(item), options.query) === NAME_MATCH.exact);
  const rest = byName.filter((item) => !exact.includes(item));
  return options.taskRecognised ? [...exact, ...pool, ...rest] : [...exact, ...rest, ...pool];
}

export function describeNameMatch(rank: number, query: string): string {
  const q = query.trim();
  if (rank === NAME_MATCH.exact) return 'Exact name';
  if (rank === NAME_MATCH.start) return `Name starts with “${q}”`;
  if (rank === NAME_MATCH.wordStart) return `A word in its name starts with “${q}”`;
  return `Name contains “${q}”`;
}

/** Edit distance, for "did you mean". */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * How close a typed name is to a real one, 0 (unrelated) to 1 (same).
 * Compared against the whole name and each word of it, so "brinkwach"
 * finds Brinkwatch and "keel" finds "Keel Vault".
 */
export function nameSimilarity(name: string, query: string): number {
  const q = normalise(query);
  const n = normalise(name);
  if (!q || !n) return 0;
  const candidates = [n, ...n.split(' ')];
  return Math.max(...candidates.map((c) => 1 - levenshtein(c, q) / Math.max(c.length, q.length)));
}

/** Names close enough to suggest: the closest few above a floor. */
export function closestNames<T>(items: T[], nameOf: (item: T) => string, query: string, limit = 3, floor = 0.55): T[] {
  return items
    .map((item) => ({ item, score: nameSimilarity(nameOf(item), query) }))
    .filter((x) => x.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}
