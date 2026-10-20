import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { continuesEpisode, extendEpisode, openEpisode, type SaturationEpisode, type SaturationSighting } from './saturation';

/**
 * Saturation, kept past the end of the log buffer.
 *
 * The detector shipped on 19 October worked: on 20 October it found the
 * machine starved, named the event loop as the cause and printed the lag.
 * Then the one incident it was built for came and went, and by the time
 * anyone read the logs the window that mattered — 10:49 to 11:16 — had
 * scrolled out of a buffer that holds minutes. Service was restored on a
 * guess, because the evidence had expired.
 *
 * Everything else here that matters is written to the volume: sweeps,
 * probes, receipts. A signal that only ever reached stdout was the odd one
 * out, and being the odd one out cost a diagnosis.
 *
 * One row per episode, not per check. That stall ran about twenty-seven
 * minutes, which at Fly's cadence is something over a hundred checks, and a
 * hundred rows saying "still bad" answer nothing that four columns do not:
 * when it started, when it was last seen, how bad it got, and how often.
 * What counts as one episode is decided in `./saturation`, where it is
 * testable; this file only persists the answer.
 */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS saturation_episodes (
    started_at      TEXT PRIMARY KEY,
    last_seen_at    TEXT NOT NULL,
    checks          INTEGER NOT NULL,
    peak_lag_p99_ms REAL,
    peak_timed_out  INTEGER NOT NULL,
    reasons         TEXT NOT NULL
  );
`;

type Row = { started_at: string; last_seen_at: string; checks: number; peak_lag_p99_ms: number | null; peak_timed_out: number; reasons: string };

const fromRow = (r: Row): SaturationEpisode => ({
  startedAt: r.started_at,
  lastSeenAt: r.last_seen_at,
  checks: r.checks,
  peakLagP99Ms: r.peak_lag_p99_ms,
  peakTimedOut: r.peak_timed_out,
  reasons: JSON.parse(r.reasons) as string[],
});

class SaturationStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  /** The newest episode, open or closed. */
  latest(): SaturationEpisode | null {
    const row = this.db.prepare('SELECT * FROM saturation_episodes ORDER BY started_at DESC LIMIT 1').get() as Row | undefined;
    return row ? fromRow(row) : null;
  }

  /** Newest first, for reading a pattern rather than one event. */
  recent(limit = 20): SaturationEpisode[] {
    return (this.db.prepare('SELECT * FROM saturation_episodes ORDER BY started_at DESC LIMIT ?').all(limit) as Row[]).map(fromRow);
  }

  /** Record a check that found the process saturated. */
  note(sighting: SaturationSighting): SaturationEpisode {
    const open = this.latest();
    const episode = continuesEpisode(open, sighting) ? extendEpisode(open!, sighting) : openEpisode(sighting);
    this.db
      .prepare(
        `INSERT INTO saturation_episodes (started_at, last_seen_at, checks, peak_lag_p99_ms, peak_timed_out, reasons)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(started_at) DO UPDATE SET last_seen_at = excluded.last_seen_at, checks = excluded.checks, peak_lag_p99_ms = excluded.peak_lag_p99_ms, peak_timed_out = excluded.peak_timed_out, reasons = excluded.reasons`,
      )
      .run(episode.startedAt, episode.lastSeenAt, episode.checks, episode.peakLagP99Ms, episode.peakTimedOut, JSON.stringify(episode.reasons));
    return episode;
  }
}

let store: SaturationStore | null = null;
export function getSaturationStore(): SaturationStore {
  store ??= new SaturationStore(process.env.SATURATION_DB_PATH ?? './data/saturation.db');
  return store;
}

/**
 * The two calls the health check makes, and why they swallow everything.
 *
 * This check is the one thing the platform acts on: a throw here is a 503,
 * and with one machine a 503 takes the site off the proxy entirely. The
 * route's own note says saturation must not gate for exactly that reason —
 * recording it must not gate either, or evidence-keeping becomes a second
 * way for a struggling machine to be killed. These are also the only place
 * the health route touches SQLite at all, so a corrupt file here must cost a
 * record, never the check.
 *
 * Writing happens only while saturated, so the ordinary path pays nothing.
 */
export function recordSaturation(sighting: SaturationSighting): void {
  try {
    getSaturationStore().note(sighting);
  } catch (error) {
    console.warn(`[health] could not record saturation: ${(error as Error).message}`);
  }
}

export function lastSaturation(): SaturationEpisode | null {
  try {
    return getSaturationStore().latest();
  } catch {
    return null;
  }
}
