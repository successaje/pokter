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

export function shortHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

export function shortAddress(address: string): string {
  return shortHash(address, 4);
}
