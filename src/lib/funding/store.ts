import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { lookupFirstFunder } from './funder';

/**
 * First funders of agent owner wallets, cached.
 *
 * A wallet's first funder never changes, so a found one is kept for good.
 * "Received nothing yet" is kept too, but looked at again after a week,
 * because an unused wallet may be funded later.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS funders (
    address    TEXT PRIMARY KEY,
    funder     TEXT,
    checked_at TEXT NOT NULL
  );
`;

const RECHECK_EMPTY_MS = 7 * 86_400_000;

class FunderStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  /** Known funders for these addresses. Addresses never looked up are absent. */
  funders(addresses: string[]): Map<string, string | null> {
    const out = new Map<string, string | null>();
    const read = this.db.prepare('SELECT funder FROM funders WHERE address = ?');
    for (const raw of new Set(addresses.map((a) => a.toLowerCase()))) {
      const row = read.get(raw) as { funder: string | null } | undefined;
      if (row) out.set(raw, row.funder);
    }
    return out;
  }

  /** Addresses that need a lookup: never checked, or empty and stale. */
  due(addresses: string[], now = Date.now()): string[] {
    const read = this.db.prepare('SELECT funder, checked_at FROM funders WHERE address = ?');
    return [...new Set(addresses.map((a) => a.toLowerCase()))].filter((address) => {
      const row = read.get(address) as { funder: string | null; checked_at: string } | undefined;
      if (!row) return true;
      return row.funder === null && now - Date.parse(row.checked_at) > RECHECK_EMPTY_MS;
    });
  }

  record(address: string, funder: string | null): void {
    this.db
      .prepare(
        `INSERT INTO funders (address, funder, checked_at) VALUES (?, ?, ?)
         ON CONFLICT (address) DO UPDATE SET funder = excluded.funder, checked_at = excluded.checked_at`,
      )
      .run(address.toLowerCase(), funder, new Date().toISOString());
  }
}

/** Relative on purpose, as in the other stores: see history/store.ts. */
const DB_PATH = process.env.FUNDER_DB_PATH ?? './data/funders.db';

let cached: FunderStore | null = null;

export function getFunderStore(): FunderStore {
  if (cached) return cached;
  cached = new FunderStore(DB_PATH);
  return cached;
}

/**
 * Look up the owners that are due, a bounded number per run.
 *
 * Off without NODEREAL_API_KEY: the ranking then groups by owner wallet,
 * as it did before. A failed lookup is left for the next run rather than
 * stored, so an outage never records a wallet as unfunded.
 */
export async function refreshFunders(
  owners: string[],
  { limit = 40 }: { limit?: number } = {},
): Promise<{ enabled: boolean; looked: number; found: number; failed: number }> {
  const apiKey = process.env.NODEREAL_API_KEY;
  if (!apiKey) return { enabled: false, looked: 0, found: 0, failed: 0 };
  const store = getFunderStore();
  const due = store.due(owners).slice(0, limit);
  let found = 0;
  let failed = 0;
  for (const address of due) {
    try {
      const { funder } = await lookupFirstFunder(address, { apiKey });
      store.record(address, funder);
      if (funder) found += 1;
    } catch {
      failed += 1;
    }
  }
  return { enabled: true, looked: due.length, found, failed };
}
