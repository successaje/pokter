import { canonicalJson, sealHash } from '@/lib/seals/canonical';

/**
 * What Pokter said about the catalogue at one moment, fixed so it cannot
 * be revised afterwards.
 *
 * Everything else on this site can be checked against the chain by a
 * stranger: an identity, an owner, a job's status and budget. Pokter's
 * own judgments cannot. Nothing stops this marketplace from quietly
 * raising an agent's verdict after that agent turned out well, or
 * lowering it after a hire went badly, and a reader would have no way to
 * tell — the page would simply have always said so.
 *
 * A seal removes that move. The claims are written down, hashed, and the
 * hash goes on chain before any of the outcomes they describe are known.
 * A reader comparing today's page against last week's seal can see
 * exactly what changed, and the block timestamp proves Pokter could not
 * have written it afterwards.
 *
 * What a seal does not do, and the page must say so: it proves *when* a
 * claim was published, never that the claim was true. Sealing a wrong
 * verdict fixes the wrongness in amber. That is the point — it is
 * evidence against revision, not evidence of correctness.
 *
 * Only Pokter's own measurements and judgments are sealed. An operator's
 * declared description is theirs to change and carries no provenance
 * here, so committing to it would seal somebody else's words.
 */

export const SEAL_VERSION = 1;

export interface SealedClaim {
  chainId: number;
  tokenId: string;
  /** Pokter's list-level signal. */
  verdict: string;
  /** Pokter's classifier, not the operator's declaration. */
  category: string;
  /**
   * The two integers availability is computed from, never the ratio.
   *
   * A sealed `0.993` could not be recomputed to the same bits by a
   * reader on another machine; two counts can.
   */
  probes: { total: number; answered: number };
  /** Whole days of observation, floored: a seal cannot carry a fraction. */
  observedDays: number;
  /** The signed price as its raw integer string, or null if never quoted. */
  priceRaw: string | null;
  priceCurrency: string | null;
  /** Attestations published by someone other than Pokter. */
  attestations: number;
}

export interface SealDocument {
  version: number;
  /** When the claims were read, ISO-8601 to the second. */
  sealedAt: string;
  /** The origin these claims were published from. */
  origin: string;
  claims: SealedClaim[];
}

/** Agents in one fixed order, so two runs over one catalogue agree. */
function ordered(claims: readonly SealedClaim[]): SealedClaim[] {
  return [...claims].sort((a, b) =>
    a.chainId !== b.chainId
      ? a.chainId - b.chainId
      : /* Token ids are decimal strings of arbitrary length, so they sort
           numerically rather than lexically: "9" belongs after "100". */
        BigInt(a.tokenId) < BigInt(b.tokenId)
        ? -1
        : BigInt(a.tokenId) > BigInt(b.tokenId)
          ? 1
          : 0,
  );
}

export function buildSealDocument(input: {
  sealedAt: Date;
  origin: string;
  claims: readonly SealedClaim[];
}): SealDocument {
  return {
    version: SEAL_VERSION,
    /* Truncated to the second: milliseconds would differ between the
       document and anything regenerated from it, for no gain. */
    sealedAt: `${input.sealedAt.toISOString().slice(0, 19)}Z`,
    origin: input.origin,
    claims: ordered(input.claims),
  };
}

/** The document text that was hashed, and its hash. */
export function sealOf(document: SealDocument): { text: string; hash: `0x${string}` } {
  return { text: canonicalJson(document), hash: sealHash(document) };
}

/**
 * Whether a document a reader downloaded is the one a hash committed to.
 *
 * The comparison is on the recomputed hash rather than on the text, so a
 * reader who reformats the file while looking at it still gets a true
 * answer.
 */
export function sealMatches(document: SealDocument, hash: string): boolean {
  return sealHash(document).toLowerCase() === hash.toLowerCase();
}

/**
 * What changed between two seals, by agent.
 *
 * This is the thing a seal is for: not the hash, but the diff a reader
 * can hold up. Returned as plain data so both the API and a reader's own
 * script can produce the same list.
 */
export interface ClaimChange {
  key: string;
  field: keyof SealedClaim;
  before: unknown;
  after: unknown;
}

export function diffSeals(earlier: SealDocument, later: SealDocument): {
  changed: ClaimChange[];
  added: string[];
  removed: string[];
} {
  const key = (c: SealedClaim) => `${c.chainId}:${c.tokenId}`;
  const before = new Map(earlier.claims.map((c) => [key(c), c]));
  const after = new Map(later.claims.map((c) => [key(c), c]));

  const changed: ClaimChange[] = [];
  for (const [k, now] of after) {
    const then = before.get(k);
    if (!then) continue;
    for (const field of Object.keys(now) as (keyof SealedClaim)[]) {
      if (field === 'chainId' || field === 'tokenId') continue;
      const a = canonicalJson(then[field] ?? null);
      const b = canonicalJson(now[field] ?? null);
      if (a !== b) changed.push({ key: k, field, before: then[field], after: now[field] });
    }
  }
  return {
    changed,
    added: [...after.keys()].filter((k) => !before.has(k)),
    removed: [...before.keys()].filter((k) => !after.has(k)),
  };
}
