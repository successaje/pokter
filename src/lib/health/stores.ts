/**
 * Every durable store this product keeps, in one place.
 *
 * The health check used to carry its own list of eight. There were sixteen,
 * so half of them were unchecked — including, had it shipped, the briefs
 * store, whose path was never added to fly.toml and would therefore have
 * defaulted to a directory that does not survive a restart. Every brief
 * posted and every bid made would have been lost on the next deploy, and
 * nothing would have said so: the check reported `persistent: true` because
 * the eight stores it happened to know about were all on the volume.
 *
 * A list maintained by hand beside the thing it describes drifts, and this
 * one did. So it lives here, it is the only list, and `tests/health-stores`
 * holds it to the source: a store the code reads and this does not name
 * fails the suite, as does one named here that fly.toml has not pinned to
 * the volume. Adding a store is then three lines and a failing test tells
 * you the third.
 */
export interface StoreDescriptor {
  /** The key the health check reports this store under. */
  name: string;
  /** The environment variable that sets its path. */
  variable: string;
  /** Where it goes when the variable is unset: never a durable location. */
  fallback: string;
}

export const STORES: readonly StoreDescriptor[] = [
  { name: 'probes', variable: 'PROBE_DB_PATH', fallback: './data/probes.db' },
  { name: 'sessions', variable: 'SESSION_DB_PATH', fallback: './data/sessions.db' },
  { name: 'jobs', variable: 'JOB_DB_PATH', fallback: './data/jobs.db' },
  { name: 'deliverables', variable: 'DELIVERABLE_DB_PATH', fallback: './data/deliverables.db' },
  { name: 'rateLimits', variable: 'RATE_LIMIT_DB_PATH', fallback: './data/rate-limit.db' },
  { name: 'notifications', variable: 'NOTIFICATION_DB_PATH', fallback: './data/notifications.db' },
  { name: 'reviews', variable: 'REVIEW_DB_PATH', fallback: './data/reviews.db' },
  { name: 'builders', variable: 'BUILDER_DB_PATH', fallback: './data/builders.db' },
  { name: 'funders', variable: 'FUNDER_DB_PATH', fallback: './data/funders.db' },
  { name: 'assay', variable: 'ASSAY_DB_PATH', fallback: './data/assay.db' },
  { name: 'quest', variable: 'QUEST_DB_PATH', fallback: './data/quest.db' },
  { name: 'conversion', variable: 'CONVERSION_DB_PATH', fallback: './data/conversion.db' },
  { name: 'seals', variable: 'SEAL_DB_PATH', fallback: './data/seals.db' },
  { name: 'walletActivity', variable: 'WALLET_ACTIVITY_DB_PATH', fallback: './data/wallet-activity.db' },
  { name: 'capability', variable: 'CAPABILITY_DB_PATH', fallback: './data/capability.db' },
  { name: 'feedback', variable: 'FEEDBACK_DB_PATH', fallback: './data/feedback.db' },
  { name: 'briefs', variable: 'BRIEF_DB_PATH', fallback: './data/briefs.db' },
  { name: 'profiles', variable: 'PROFILE_DB_PATH', fallback: './data/profiles.db' },
  { name: 'maintenance', variable: 'MAINTENANCE_DB_PATH', fallback: './data/maintenance.db' },
  { name: 'saturation', variable: 'SATURATION_DB_PATH', fallback: './data/saturation.db' },
];

/** Where a store will actually be written, given the current environment. */
export function storePath(store: StoreDescriptor): string {
  return process.env[store.variable] ?? store.fallback;
}

/**
 * Whether a path survives a restart.
 *
 * The volume is mounted at `/data` (fly.toml `[mounts]`), and anything else
 * is the container's own filesystem, which is replaced on every deploy.
 */
export function isDurable(path: string): boolean {
  return path.startsWith('/data/');
}
