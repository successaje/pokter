'use client';

/**
 * Which draft is mid-registration, so a remount can find its way back.
 *
 * The registration result is persisted per draft, under a key built from
 * the draft's id. A draft opened from the Drafts list keeps its id, and a
 * brand-new one does not: it is `draft-${Date.now()}`, minted fresh on
 * every mount. So when the page remounted during a registration — which
 * a wallet does on mainnet, because the flow asks it to switch network —
 * the new id matched neither the saved result nor the saved recovery.
 * Both lookups missed and the reader was returned to an empty form with
 * an identity already minted on chain.
 *
 * That happened: 56/372022 was registered, both transactions landed, and
 * the screen said nothing at all. The danger is not the missing message,
 * it is what somebody reasonably does next, which is register again and
 * pay for a second identity.
 *
 * So the id of a registration in flight is remembered on its own, and a
 * fresh mount adopts it instead of minting a new one.
 *
 * It expires. The purpose is to carry one flow across a reload, not to
 * resurrect a success from yesterday onto the form of somebody starting
 * something new — an hour is far longer than a registration and far
 * shorter than a session worth confusing.
 */

const ACTIVE_KEY = 'pokter-agent-registration-active-v1';
export const ACTIVE_TTL_MS = 60 * 60 * 1000;

export interface ActiveRegistration {
  draftId: string;
  at: number;
}

/** Whether a remembered registration is recent enough to adopt. */
export function isAdoptable(
  record: ActiveRegistration | null,
  now: number = Date.now(),
): record is ActiveRegistration {
  if (!record || typeof record.draftId !== 'string' || !record.draftId) return false;
  if (typeof record.at !== 'number' || !Number.isFinite(record.at)) return false;
  /* A clock that moved backwards is not a reason to lose a mint. */
  const age = now - record.at;
  return age < ACTIVE_TTL_MS;
}

export function rememberActiveRegistration(draftId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ draftId, at: Date.now() }));
  } catch {
    /* Then it survives only this mount, which is what it did before. */
  }
}

export function readActiveRegistration(): ActiveRegistration | null {
  try {
    const stored = window.localStorage.getItem(ACTIVE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as ActiveRegistration;
    return isAdoptable(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function forgetActiveRegistration(): void {
  try {
    window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* Harmless: it expires on its own. */
  }
}
