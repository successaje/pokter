import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { sanitiseFailureReason } from '@/lib/erc8183/delivery-diagnostics';
import { requestClientKey } from '@/lib/security/rate-limit';
import type { FailureLayer, QuoteFailureCode } from '@/lib/hire/failure';
import {
  ATTEMPT_RETENTION_DAYS,
  ATTEMPT_WINDOW_DAYS,
  attemptDay,
  attemptFingerprint,
  type AttemptOutcome,
  type AttemptSource,
  type HireAttemptRow,
} from './attempt';
import {
  applyHireAttemptSchema,
  attemptSaltIn,
  pruneHireAttemptsIn,
  readHireAttemptsIn,
  recordHireAttemptIn,
} from './attempt-sql';
import { WITHHELD_REASON_TEXT } from './withheld';

/**
 * Left as a relative path on purpose, as the other stores are:
 * `path.resolve` on an environment-derived value makes the bundler trace
 * the whole project, and node:sqlite resolves relative paths against the
 * working directory just as well.
 */
const DB_PATH = process.env.HIRE_ATTEMPT_DB_PATH ?? './data/hire-attempts.db';

let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  // WAL, so a builder reading diagnostics does not block a buyer's quote.
  database.exec('PRAGMA journal_mode = WAL');
  applyHireAttemptSchema(database);
  return database;
}

const DAY_MS = 86_400_000;
let lastPrunedAt = 0;

function pruneOccasionally(now: number): void {
  if (now - lastPrunedAt < 6 * 3_600_000) return;
  lastPrunedAt = now;
  pruneHireAttemptsIn(db(), new Date(now - ATTEMPT_RETENTION_DAYS * DAY_MS).toISOString());
}

/**
 * Record one quote attempt against an agent.
 *
 * Takes the `Request` rather than an address so the caller never has to
 * handle the network address at all: the key it produces is hashed with
 * the brief and a per-database salt and then dropped. What reaches disk is
 * a 128-bit opaque value, the agent, the outcome and the failure code.
 *
 * Never throws. A diagnostics row that could not be written is a lost row;
 * it is not worth failing a buyer's hire over, and a quote route that
 * returns 500 because a counter was busy is a worse failure than the one
 * it was recording.
 */
export function recordHireAttempt(input: {
  request: Request;
  chainId: number;
  tokenId: string;
  brief: string;
  escrowChainId: number | null;
  source: AttemptSource;
  outcome: AttemptOutcome;
  code?: QuoteFailureCode | null;
  layer?: FailureLayer | null;
  /** The seller's words, raw. Sanitised here so no caller can forget to. */
  sellerReason?: string | null;
  now?: Date;
}): void {
  try {
    const now = input.now ?? new Date();
    const handle = db();
    const fingerprint = attemptFingerprint({
      salt: attemptSaltIn(handle),
      clientKey: requestClientKey(input.request),
      chainId: input.chainId,
      tokenId: input.tokenId,
      brief: input.brief,
      day: attemptDay(now),
    });
    /*
     * Through the hardened sanitiser, not a second one. A seller's refusal
     * is free text from somebody else's endpoint, and `sanitiseFailureReason`
     * withholds a whole reason rather than return a partial it cannot bound —
     * so `null` here means "could not be shown safely", which the report
     * says in those words instead of showing nothing.
     */
    const safe = input.sellerReason ? sanitiseFailureReason(input.sellerReason) : null;
    recordHireAttemptIn(handle, {
      chainId: input.chainId,
      tokenId: input.tokenId,
      escrowChainId: input.escrowChainId,
      source: input.source,
      outcome: input.outcome,
      code: input.code ?? null,
      layer: input.layer ?? null,
      sellerReason: safe === null && input.sellerReason ? WITHHELD_REASON_TEXT : safe,
      at: now.toISOString(),
      fingerprint,
    });
    pruneOccasionally(now.getTime());
  } catch {
    /* A lost diagnostics row never costs a hire. */
  }
}

/** Attempts on one agent in the diagnostics window. Empty when unreadable. */
export function readHireAttempts(
  chainId: number,
  tokenId: string,
  windowDays = ATTEMPT_WINDOW_DAYS,
  now = new Date(),
): HireAttemptRow[] {
  try {
    return readHireAttemptsIn(db(), {
      chainId,
      tokenId,
      since: new Date(now.getTime() - windowDays * DAY_MS).toISOString(),
    });
  } catch {
    /*
     * An empty list is not the same claim as "no buyer tried", and the
     * report says which it has: see `attemptsReadable` in the collector.
     */
    return [];
  }
}

/** Whether the attempt store can be read at all, so the page can say so. */
export function hireAttemptsReadable(): boolean {
  try {
    db().prepare('SELECT 1 FROM hire_attempts LIMIT 1').get();
    return true;
  } catch {
    return false;
  }
}
