/**
 * Job numbers the recovery scan must look at again.
 *
 * The scan used to skip a job it could not read, and an OPEN job, then move
 * its cursor past both: one failed RPC call, or a buyer who funded a minute
 * after the scan, and that hire was never recovered. They are kept here and
 * revisited first on every run, until they resolve or age out.
 */
export const MAX_PENDING = 500;
export const REVISIT_PER_RUN = 50;

export function nextPending(previous: number[], add: number[], resolved: number[], oldestAllowed: number): number[] {
  const done = new Set(resolved);
  const merged = [...new Set([...previous, ...add])].filter((id) => !done.has(id) && id >= oldestAllowed).sort((a, b) => a - b);
  // When over the cap, keep the newest: those are the ones still inside their deadlines.
  return merged.slice(-MAX_PENDING);
}

export function parsePending(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [];
  } catch {
    return [];
  }
}
