import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pokter-rate-limit-'));
const databasePath = join(temporaryDirectory, 'limits.db');
process.env.RATE_LIMIT_DB_PATH = databasePath;
process.env.POKTER_TRUSTED_CLIENT_IP_HEADER = 'fly-client-ip';

/*
 * The production volume holds a table from before each row recorded its
 * window. Start from one, with a row in it, so the checks below run
 * against the table as it will be found.
 */
const startedAt = Date.now();
const legacy = new DatabaseSync(databasePath);
legacy.exec('CREATE TABLE windows (key TEXT PRIMARY KEY, started_at INTEGER NOT NULL, count INTEGER NOT NULL)');
legacy.prepare('INSERT INTO windows (key, started_at, count) VALUES (?, ?, ?)').run('legacy-row', startedAt, 1);
legacy.close();

try {
  const { consumeRateLimit, requestClientKey } = await import(
    '../src/lib/security/rate-limit'
  );

  const request = new Request('https://pokter.xyz/api/trial', {
    headers: {
      'fly-client-ip': '203.0.113.8',
      'x-forwarded-for': '198.51.100.1',
    },
  });
  if (requestClientKey(request) !== '203.0.113.8') {
    throw new Error('The configured trusted client IP header was not used');
  }

  const spoofOnly = new Request('https://pokter.xyz/api/trial', {
    headers: { 'x-forwarded-for': '198.51.100.1' },
  });
  if (requestClientKey(spoofOnly) !== 'unknown') {
    throw new Error('An untrusted forwarding header bypassed the shared bucket');
  }

  const outcomes = Array.from({ length: 5 }, () =>
    consumeRateLimit('same-caller', { limit: 3, windowMs: 60_000 }),
  );
  if (outcomes.filter((value) => value.allowed).length !== 3) {
    throw new Error('The limiter admitted more than the configured allowance');
  }
  if (outcomes.slice(3).some((value) => value.retryAfterSeconds < 1)) {
    throw new Error('Refused requests did not receive a retry delay');
  }

  /*
   * A window longer than the prune interval holds for its whole length.
   * Pruning used to delete every row older than an hour, so the gas
   * sponsor's per-day limits were cleared within two hours.
   */
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const realNow = Date.now;
  let clock = startedAt;
  Date.now = () => clock;
  const rows = () => {
    const reader = new DatabaseSync(databasePath, { readOnly: true });
    try {
      return new Set((reader.prepare('SELECT key FROM windows').all() as Array<{ key: string }>).map((row) => row.key));
    } finally {
      reader.close();
    }
  };
  try {
    const daily = () => consumeRateLimit('sponsor:wallet:0xabc', { limit: 2, windowMs: DAY });
    const first = [daily(), daily(), daily()].map((value) => value.allowed);
    if (first.join() !== 'true,true,false') {
      throw new Error(`A day-long limit of two admitted ${first.filter(Boolean).length}`);
    }
    consumeRateLimit('a-minute-caller', { limit: 5, windowMs: 60_000 });

    /* Two hours on, the hourly prune runs on the next request. */
    clock = startedAt + 2 * HOUR;
    consumeRateLimit('wakes-the-prune', { limit: 5, windowMs: 60_000 });
    const later = daily();
    if (later.allowed) {
      throw new Error('A day-long limit was cleared by the hourly prune and admitted a third request');
    }
    if (later.retryAfterSeconds < 21 * 3600) {
      throw new Error(`A day-long refusal said to retry in ${later.retryAfterSeconds}s, before its day was up`);
    }
    const afterPrune = rows();
    if (afterPrune.has('a-minute-caller')) {
      throw new Error('A closed one-minute window was not pruned');
    }
    if (!afterPrune.has('legacy-row')) {
      throw new Error('A row from the old table was pruned before a day had passed');
    }

    /* A day on, the window has closed: the limit admits again, and the old row goes. */
    clock = startedAt + DAY + HOUR;
    if (!daily().allowed) {
      throw new Error('A day-long limit still refused after its day had passed');
    }
    if (rows().has('legacy-row')) {
      throw new Error('A row from the old table was kept after a day');
    }
  } finally {
    Date.now = realNow;
  }

  console.log('Rate-limit safety checks passed.');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
