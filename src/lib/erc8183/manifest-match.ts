import { keccak256, sha256, stringToBytes } from 'viem';

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
 * `canonical`: the same sorted, compact JSON with every non-ASCII character
 * escaped as `\uXXXX`. That is the ERC-8004/8183 hashing form (the SDK's
 * `canonicalJson`, and Python's `json.dumps(sort_keys=True,
 * separators=(",", ":"))`), which a Python seller produces by default.
 * Halong Yield commits it: its job 97:1571 had no non-ASCII text and matched
 * as `sorted-keys`, and 97:1588 contained one "’", served raw but hashed
 * escaped, and its buyer was told the delivery did not match. It did.
 *
 * `sha256`: SHA-256 of exactly the bytes served. Brain on BNB commits that,
 * and says so in the record itself ("the bytes32 on this job is the SHA-256
 * of exactly this document as served"). Its mainnet job 56:57016 matched
 * that way byte for byte, and its buyer was told, while about to release,
 * that the file did not match. Only the bytes as served: a re-serialised
 * record hashed with SHA-256 is not a form any seller has been seen to use,
 * and accepting more forms than sellers use only widens what a forgery may
 * aim at.
 *
 * The sorted forms are accepted because they fix the content, not the
 * layout. Pokter reads a delivery through `JSON.parse` either way, and an
 * escaped character parses to the same character, so what a buyer is shown
 * is exactly what was committed. Any other difference is still a mismatch.
 */
export type ManifestMatch = 'exact' | 'sorted-keys' | 'canonical' | 'sha256';

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

/** `sortedKeysText` with every non-ASCII UTF-16 unit escaped, byte for byte the SDK's `canonicalJson`. */
export function canonicalText(text: string): string | null {
  const sorted = sortedKeysText(text);
  return sorted === null ? null : sorted.replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function manifestMatch(text: string, chainHash: string | null | undefined): ManifestMatch | null {
  if (!chainHash) return null;
  const expected = chainHash.toLowerCase();
  const bytes = stringToBytes(text);
  if (keccak256(bytes).toLowerCase() === expected) return 'exact';
  if (sha256(bytes).toLowerCase() === expected) return 'sha256';
  const sorted = sortedKeysText(text);
  if (sorted !== null && keccak256(stringToBytes(sorted)).toLowerCase() === expected) return 'sorted-keys';
  const canonical = canonicalText(text);
  if (canonical !== null && canonical !== sorted && keccak256(stringToBytes(canonical)).toLowerCase() === expected) return 'canonical';
  return null;
}
