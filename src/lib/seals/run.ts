import 'server-only';

import { anchorSeal } from '@/lib/seals/anchor';
import { sealAction } from '@/lib/seals/cadence';
import { readSealClaims } from '@/lib/seals/claims';
import { buildSealDocument, sealOf } from '@/lib/seals/document';
import { getSealStore } from '@/lib/seals/store';
import { siteOrigin } from '@/lib/evidence/origin';

/**
 * Publish one seal a day: read the claims, write them down, then commit.
 *
 * The order matters and is the whole safety argument. The text is stored
 * before the transaction is sent, so a crash between the two leaves a
 * document waiting for its anchor rather than an anchor committing to
 * bytes nobody kept. A seal with no anchor is merely unproven; an anchor
 * with no document is a hash Pokter could claim anything about later,
 * which is worse than publishing nothing.
 *
 * Called from the sweep, which runs far more often than daily, so most
 * calls do nothing. A yesterday's seal that never reached the chain is
 * anchored on the next run instead of being replaced.
 */

export interface SealOutcome {
  status: 'sealed' | 'anchored' | 'stored' | 'skipped';
  hash?: string;
  sealedAt?: string;
  claims?: number;
  /** When the next seal is due, on a run that did nothing. */
  nextDueAt?: string;
  /** Why the chain step did not happen, when it did not. */
  note?: string;
}

export async function publishSeal(now = new Date()): Promise<SealOutcome> {
  const store = getSealStore();
  const [latest] = store.recent(1);
  const action = sealAction(
    latest ? { hash: latest.hash, sealedAt: latest.sealedAt, anchored: latest.anchor !== null } : null,
    now,
  );

  if (action.kind === 'skip') {
    return { status: 'skipped', hash: latest.hash, nextDueAt: action.nextDueAt };
  }

  if (action.kind === 'anchor') {
    try {
      store.anchor(action.hash, await anchorSeal(action.hash as `0x${string}`));
      return { status: 'anchored', hash: action.hash };
    } catch (error) {
      return {
        status: 'stored',
        hash: action.hash,
        note: error instanceof Error ? error.message : 'The seal is stored but still unanchored.',
      };
    }
  }

  const claims = await readSealClaims();
  const document = buildSealDocument({ sealedAt: now, origin: siteOrigin().origin, claims });
  const { text, hash } = sealOf(document);

  store.record({ hash, sealedAt: document.sealedAt, text, claimCount: claims.length });

  try {
    store.anchor(hash, await anchorSeal(hash));
    return { status: 'sealed', hash, sealedAt: document.sealedAt, claims: claims.length };
  } catch (error) {
    /*
     * A failed anchor keeps the document. Throwing it away because a
     * public node was busy would leave a gap in the record that looks
     * exactly like a seal somebody chose not to publish.
     */
    return {
      status: 'stored',
      hash,
      sealedAt: document.sealedAt,
      claims: claims.length,
      note: error instanceof Error ? error.message : 'The seal was stored but not anchored.',
    };
  }
}
