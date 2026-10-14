import { keccak256, toHex } from 'viem';

/**
 * The exact bytes a seal commits to.
 *
 * A seal is worth nothing if the same claims can hash two ways, so the
 * serialisation is pinned here rather than left to `JSON.stringify`:
 * object keys are written in sorted order, and the output has no
 * incidental whitespace. Two people with the same claims must produce
 * the same hash on different machines, in different years.
 *
 * Floating-point numbers are refused outright. `0.1 + 0.2` is the
 * standard example of why, but the real reason is narrower: this
 * document carries prices and availability, and a price that round-trips
 * through a float can seal one number and serve another. Money travels
 * as its integer string, ratios travel as the two integers they came
 * from, and anything that cannot be written that way does not belong in
 * a seal.
 */

export class NonCanonical extends Error {}

function write(value: unknown, path: string): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new NonCanonical(`${path} is ${String(value)}, which has no canonical form.`);
      }
      if (!Number.isInteger(value)) {
        throw new NonCanonical(
          `${path} is ${value}; a seal takes integers only, so write a fraction as its numerator and denominator and money as its raw integer string.`,
        );
      }
      /* Integers beyond this lose precision silently, which is the same
         failure as a float: the sealed text stops matching the input. */
      if (!Number.isSafeInteger(value)) {
        throw new NonCanonical(`${path} is beyond the safe integer range; send it as a string.`);
      }
      return String(value);
    case 'object':
      break;
    default:
      throw new NonCanonical(`${path} is a ${typeof value}, which cannot be sealed.`);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item, index) => write(item, `${path}[${index}]`)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    /* Undefined is absence, and absence is not a value: writing it would
       make a document that drops a key hash differently from one that
       never had it. */
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries
    .map(([key, v]) => `${JSON.stringify(key)}:${write(v, `${path}.${key}`)}`)
    .join(',')}}`;
}

/** Deterministic text for a value: sorted keys, no incidental whitespace. */
export function canonicalJson(value: unknown): string {
  return write(value, '$');
}

/**
 * The commitment itself.
 *
 * keccak256 because the anchor is an Ethereum transaction and a reader
 * checking the seal is already holding Ethereum tools; asking them to
 * install something else to check one hash would be a reason not to
 * bother.
 */
export function sealHash(value: unknown): `0x${string}` {
  return keccak256(toHex(canonicalJson(value)));
}
