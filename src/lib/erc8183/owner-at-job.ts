/**
 * Whether Pokter may say who owned a hired agent when its job was funded.
 *
 * The registry only answers who owns an agent now. Read close to the
 * funding, that is who took the job on; read later, it may be whoever the
 * agent was sold to since, and crediting them with work done before they
 * owned it is the mistake this exists to avoid. So an owner is recorded
 * only when the funding is proven recent: by the block the funding
 * transaction landed in, never by when Pokter first saw the job, which for
 * a backfilled job is the day of the backfill.
 *
 * Jobs funded before recording began, or seen too late, stay unattributed.
 * Nothing is filled in afterwards with today's owner.
 */
export const OWNER_WINDOW_MS = 2 * 60 * 60 * 1000;

/** A funded job without an owner yet, worth the RPC reads to check. */
export function ownerCandidate(
  job: { status: string; hireTxHash: string | null; hiredAt: string },
  hasOwner: boolean,
  nowMs: number,
): boolean {
  if (hasOwner || job.status === 'OPEN' || !job.hireTxHash) return false;
  // Pokter saw the job at or after its funding, so a job first seen outside the window was funded outside it too.
  const seenMs = Date.parse(job.hiredAt);
  return Number.isFinite(seenMs) && nowMs - seenMs <= OWNER_WINDOW_MS;
}

/** The funding block's time is the proof: within the window of the owner read, and not in the future. */
export function fundedRecently(fundedAtMs: number, nowMs: number): boolean {
  return Number.isFinite(fundedAtMs) && fundedAtMs <= nowMs + 60_000 && nowMs - fundedAtMs <= OWNER_WINDOW_MS;
}
