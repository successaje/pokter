import { NextResponse } from 'next/server';
import { accessSync, constants } from 'node:fs';
import { dirname } from 'node:path';

export const dynamic = 'force-dynamic';

const STORES = [
  ['probes', 'PROBE_DB_PATH', './data/probes.db'],
  ['sessions', 'SESSION_DB_PATH', './data/sessions.db'],
  ['jobs', 'JOB_DB_PATH', './data/jobs.db'],
  ['deliverables', 'DELIVERABLE_DB_PATH', './data/deliverables.db'],
  ['rateLimits', 'RATE_LIMIT_DB_PATH', './data/rate-limit.db'],
  ['notifications', 'NOTIFICATION_DB_PATH', './data/notifications.db'],
  ['reviews', 'REVIEW_DB_PATH', './data/reviews.db'],
  ['builders', 'BUILDER_DB_PATH', './data/builders.db'],
] as const;

export function GET(): NextResponse {
  const storage = Object.fromEntries(STORES.map(([name, variable, fallback]) => {
    const path = process.env[variable] ?? fallback;
    try {
      accessSync(dirname(path), constants.R_OK | constants.W_OK);
      return [name, { ok: true, persistent: path.startsWith('/data/') }];
    } catch {
      return [name, { ok: false, persistent: path.startsWith('/data/') }];
    }
  }));
  const writable = Object.values(storage).every((store) => store.ok);
  const persistent = process.env.NODE_ENV !== 'production' || Object.values(storage).every((store) => store.persistent);
  const healthy = writable && persistent;
  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', storage: { writable, persistent, stores: storage } },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
