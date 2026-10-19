import { keccak256, stringToBytes } from 'viem';

/**
 * How a delivered file matches the hash its agent committed on chain.
 *
 * `exact`: keccak256 of the bytes served, the form Pokter's own seller
 * commits. `sorted-keys`: keccak256 of the same JSON re-serialised compactly
 * with every object's keys in sorted order. Nagi commits that form: its
 * three outside deliveries on 19 Oct (97:1543–1545) were intact, but the job
 * page told each buyer "does not match its hash on chain", which is the one
 * thing Pokter must never say of an honest delivery.
 *
 * The sorted form is accepted because it fixes the content, not the layout.
 * Pokter reads a delivery through `JSON.parse` either way, so what a buyer is
 * shown is exactly what was committed. Any other difference is still a
 * mismatch.
 */
export type ManifestMatch = 'exact' | 'sorted-keys';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, sortKeys(object[key])]),
    );
  }
  return value;
}

/** The delivery serialised as compact JSON with sorted keys, or null when it is not JSON. */
export function sortedKeysText(text: string): string | null {
  try {
    return JSON.stringify(sortKeys(JSON.parse(text)));
  } catch {
    return null;
  }
}

export function manifestMatch(text: string, chainHash: string | null | undefined): ManifestMatch | null {
  if (!chainHash) return null;
  const expected = chainHash.toLowerCase();
  if (keccak256(stringToBytes(text)).toLowerCase() === expected) return 'exact';
  const sorted = sortedKeysText(text);
  if (sorted !== null && keccak256(stringToBytes(sorted)).toLowerCase() === expected) return 'sorted-keys';
  return null;
}
