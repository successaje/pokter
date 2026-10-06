/**
 * Display formatting.
 *
 * Every helper here has an explicit "we do not know" branch. Pokter shows
 * "Not enough data" rather than a zero, because a zero reads as a measurement
 * and an absent measurement is not one.
 */

export const NO_DATA = 'Not enough data';

export function formatPercent(
  value: number | null | undefined,
  { decimals = 1, signed = false }: { decimals?: number; signed?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const percent = value * 100;
  const sign = signed && percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(decimals)}%`;
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
}

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/** Compact form for large registry counts, e.g. 290,888 -> "290.9K". */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDuration(days: number): string {
  if (days <= 0) return 'under a day';
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 90) return `${Math.round(days)}d`;
  return `${(days / 365).toFixed(1)}y`;
}

/**
 * A span on the scale a job actually runs on.
 *
 * `formatDuration` measures an observation window in days and answers "under
 * a day" for everything shorter, which is the wrong resolution for an escrow
 * that expires in hours: a buyer waiting on a delivery needs the minutes.
 */
export function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    return rest === 0
      ? `${hours} hour${hours === 1 ? '' : 's'}`
      : `${hours}h ${rest}m`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function shortHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

export function shortAddress(address: string): string {
  return shortHash(address, 4);
}

/** A delivery duration a buyer can plan around: seconds, minutes, hours or days, never milliseconds. */
export function formatDelivery(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  const hours = ms / 3_600_000;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}
