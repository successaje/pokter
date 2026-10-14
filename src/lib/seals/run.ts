import 'server-only';

import { anchorSeal } from '@/lib/seals/anchor';
import { readSealClaims } from '@/lib/seals/claims';
import { buildSealDocument, sealOf } from '@/lib/seals/document';
import { getSealStore } from '@/lib/seals/store';
import { siteOrigin } from '@/lib/evidence/origin';

/**
 * Publish one seal: read the claims, write them down, then commit.
 *
 * The order matters and is the whole safety argument. The text is stored
 * before the transaction is sent, so a crash between the two leaves a
 * document waiting for its anchor rather than an anchor committing to
 * bytes nobody kept. A seal with no anchor is merely unproven; an anchor
 * with no document is a hash Pokter could claim anything about later,
 * which is worse than publishing nothing.
 */

export interface SealOutcome {
  hash: string;
  sealedAt: string;
  claims: number;
  anchored: boolean;
  /** Why the chain step did not happen, when it did not. */
  note?: string;
}

export async function publishSeal(): Promise<SealOutcome> {
  const claims = await readSealClaims();
  const document = buildSealDocument({
    sealedAt: new Date(),
    origin: siteOrigin().origin,
    claims,
  });
  const { text, hash } = sealOf(document);
  const store = getSealStore();

  store.record({ hash, sealedAt: document.sealedAt, text, claimCount: claims.length });

  try {
    const anchor = await anchorSeal(hash);
    store.anchor(hash, anchor);
    return { hash, sealedAt: document.sealedAt, claims: claims.length, anchored: true };
  } catch (error) {
    /*
     * A failed anchor is kept rather than thrown away. The document is
     * already saved and the next run can anchor it; losing the claims
     * because a public node was busy would leave a gap in the record
     * that looks exactly like a seal somebody chose not to publish.
     */
    return {
      hash,
      sealedAt: document.sealedAt,
      claims: claims.length,
      anchored: false,
      note: error instanceof Error ? error.message : 'The seal was stored but not anchored.',
    };
  }
}
