import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { sanitiseFailureReason } from '@/lib/erc8183/delivery-diagnostics';
import { requestClientKey } from '@/lib/security/rate-limit';
import type { FailureLayer } from '@/lib/hire/failure';
import {
  ATTEMPT_RETENTION_DAYS,
  ATTEMPT_WINDOW_DAYS,
  attemptDay,
  attemptFingerprint,
  canonicalTokenId,
  type AttemptCode,
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
import { applyPriceAskSchema, priceAskCountsIn, prunePriceAsksIn, recordPriceAskIn, type PriceAskCount } from './price-ask-sql';

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
  applyPriceAskSchema(database);
  return database;
}

const DAY_MS = 86_400_000;
let lastPrunedAt = 0;

function pruneOccasionally(now: number): void {
  if (now - lastPrunedAt < 6 * 3_600_000) return;
  lastPrunedAt = now;
  pruneHireAttemptsIn(db(), new Date(now - ATTEMPT_RETENTION_DAYS * DAY_MS).toISOString());
  prunePriceAsksIn(db(), new Date(now - ATTEMPT_RETENTION_DAYS * DAY_MS).toISOString());
}

/** How far back an owner is told about asks for a price. */
export const PRICE_ASK_WINDOW_DAYS = 30;

/**
 * A buyer asking an agent that cannot be priced for its price
 * (`price-ask-sql.ts`). True when it is a new ask; false when the same
 * person already asked for this agent today, or nothing could be written.
 */
export function recordPriceAsk(input: { request: Request; chainId: number; tokenId: string; now?: Date }): boolean {
  try {
    const now = input.now ?? new Date();
    const tokenId = canonicalTokenId(input.tokenId);
    if (tokenId === null) return false;
    const handle = db();
    const fingerprint = attemptFingerprint({
      salt: attemptSaltIn(handle),
      clientKey: requestClientKey(input.request),
      chainId: input.chainId,
      tokenId,
      brief: 'price-ask',
      day: attemptDay(now),
    });
    const recorded = recordPriceAskIn(handle, { fingerprint, chainId: input.chainId, tokenId, askedAt: now.toISOString() });
    pruneOccasionally(now.getTime());
    return recorded;
  } catch {
    return false;
  }
}

/** Asks in the last `PRICE_ASK_WINDOW_DAYS` for each agent that has any; empty when the store cannot be read. */
export function priceAskCounts(agents: ReadonlyArray<{ chainId: number; tokenId: string }>, now = Date.now()): PriceAskCount[] {
  try {
    const canonical = agents.flatMap((agent) => {
      const tokenId = canonicalTokenId(agent.tokenId);
      return tokenId === null ? [] : [{ chainId: agent.chainId, tokenId }];
    });
    return priceAskCountsIn(db(), canonical, new Date(now - PRICE_ASK_WINDOW_DAYS * DAY_MS).toISOString());
  } catch {
    return [];
  }
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
  code?: AttemptCode | null;
  layer?: FailureLayer | null;
  /** The seller's words, raw. Sanitised here so no caller can forget to. */
  sellerReason?: string | null;
  now?: Date;
}): void {
  try {
    const now = input.now ?? new Date();
    /*
     * One spelling, or no row. `045422` and `45422` are the same identity,
     * and the quote route accepts both: writing the literal string put
     * attempts under a key the panel never asks for, and the builder saw a
     * quiet month that was not quiet.
     */
    const tokenId = canonicalTokenId(input.tokenId);
    if (tokenId === null) return;
    const handle = db();
    const fingerprint = attemptFingerprint({
      salt: attemptSaltIn(handle),
      clientKey: requestClientKey(input.request),
      chainId: input.chainId,
      tokenId,
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
      tokenId,
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
    /* The same canonical key the recorder wrote under, or nothing. */
    const key = canonicalTokenId(tokenId);
    if (key === null) return [];
    return readHireAttemptsIn(db(), {
      chainId,
      tokenId: key,
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
