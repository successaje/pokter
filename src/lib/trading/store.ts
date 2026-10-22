import 'server-only';

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { FlowVerdict } from './flows';
import { ensureWatchedWallets, readOwnerList, recordSignedOwners, watchWallet, type OwnerListWrite } from './owner-list';

export interface WatchedTradingWallet {
  wallet: string;
  agentKey: string | null;
  owners: string[];
  /** When the wallet signed its owner list; null when it has never set one. */
  ownersSignedAt: string | null;
  addedAt: string;
  /** The last block scanned; the next scan starts after it. Null before the first scan. */
  scannedTo: number | null;
  lastScanAt: string | null;
  lastError: string | null;
}

export interface StoredFlow {
  txHash: string;
  wallet: string;
  block: number;
  at: string;
  verdict: FlowVerdict;
  note: string;
  sent: Array<{ symbol: string; amount: string; to: string }>;
}

/** Block ranges a wallet's scan could not cover, so the page says where it was blind. */
export interface CoverageGap {
  wallet: string;
  fromBlock: number;
  toBlock: number;
  at: string;
}

/**
 * The trading wallets Pokter watches and what it found in them.
 *
 * Public RPC serves about an hour of logs, so history cannot be read on
 * demand: each sweep reads the blocks since the last one and keeps the
 * verdicts here. A gap the sweep could not reach is recorded as a gap,
 * never filled in or skipped over in silence.
 */
class TradingStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    /* The watched-wallet row and its owner list are created and migrated in
       `./owner-list`, which is not `server-only` so that a test can run that
       SQL for real against a temp file. */
    ensureWatchedWallets(this.db);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trading_flows (
        tx_hash TEXT NOT NULL,
        wallet  TEXT NOT NULL,
        block   INTEGER NOT NULL,
        at      TEXT NOT NULL,
        verdict TEXT NOT NULL,
        note    TEXT NOT NULL,
        sent    TEXT NOT NULL,
        PRIMARY KEY (tx_hash, wallet)
      );
      CREATE INDEX IF NOT EXISTS idx_trading_flows_wallet ON trading_flows (wallet, block DESC);
      CREATE TABLE IF NOT EXISTS trading_gaps (
        wallet     TEXT NOT NULL,
        from_block INTEGER NOT NULL,
        to_block   INTEGER NOT NULL,
        at         TEXT NOT NULL
      );
    `);
  }

  /**
   * Start watching. Never touches the owner list: that is an exception to
   * the alert, and only `setOwners`, after a signature from the wallet,
   * may change it.
   */
  watch(input: { wallet: string; agentKey: string | null }): void {
    watchWallet(this.db, { ...input, addedAt: new Date().toISOString() });
  }

  /**
   * Replace the owner list with one the wallet signed at `signedAt`, if that
   * is still the newest signed list when the write happens.
   *
   * The caller verifies the signature first (`ownersSignatureProblem`, then
   * `signedByWallet`); this says whether the verified list was also the
   * newest, and the caller has to read the answer. An older request that
   * finished later used to overwrite a newer accepted list from here, so the
   * decision is now inside the write — see `./owner-list`.
   */
  setOwners(wallet: string, owners: readonly string[], signedAt: string): OwnerListWrite {
    return recordSignedOwners(this.db, { wallet, owners, signedAt });
  }

  /** The list as recorded now, for saying what won a race the caller lost. */
  owners(wallet: string): string[] {
    return readOwnerList(this.db, wallet)?.owners ?? [];
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) n FROM trading_wallets').get() as { n: number }).n;
  }

  get(wallet: string): WatchedTradingWallet | null {
    const row = this.db.prepare('SELECT * FROM trading_wallets WHERE wallet = ?').get(wallet.toLowerCase()) as Row | undefined;
    return row ? toWallet(row) : null;
  }

  /** Least recently scanned first, never-scanned before all. */
  due(limit: number): WatchedTradingWallet[] {
    return (this.db.prepare('SELECT * FROM trading_wallets ORDER BY last_scan_at IS NOT NULL, last_scan_at LIMIT ?').all(limit) as unknown as Row[]).map(toWallet);
  }

  recordScan(input: { wallet: string; scannedTo: number | null; error: string | null; flows: StoredFlow[]; gap: { fromBlock: number; toBlock: number } | null }): void {
    const now = new Date().toISOString();
    const insert = this.db.prepare('INSERT OR IGNORE INTO trading_flows (tx_hash, wallet, block, at, verdict, note, sent) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const f of input.flows) insert.run(f.txHash, input.wallet.toLowerCase(), f.block, f.at, f.verdict, f.note, JSON.stringify(f.sent));
    if (input.gap) this.db.prepare('INSERT INTO trading_gaps (wallet, from_block, to_block, at) VALUES (?, ?, ?, ?)').run(input.wallet.toLowerCase(), input.gap.fromBlock, input.gap.toBlock, now);
    this.db
      .prepare('UPDATE trading_wallets SET scanned_to = COALESCE(?, scanned_to), last_scan_at = ?, last_error = ? WHERE wallet = ?')
      .run(input.scannedTo, now, input.error, input.wallet.toLowerCase());
  }

  flows(wallet: string, limit = 100): StoredFlow[] {
    const rows = this.db.prepare('SELECT * FROM trading_flows WHERE wallet = ? ORDER BY block DESC LIMIT ?').all(wallet.toLowerCase(), limit) as Array<{ tx_hash: string; wallet: string; block: number; at: string; verdict: FlowVerdict; note: string; sent: string }>;
    return rows.map((r) => ({ txHash: r.tx_hash, wallet: r.wallet, block: r.block, at: r.at, verdict: r.verdict, note: r.note, sent: JSON.parse(r.sent) }));
  }

  /** Flows Pokter found after a given block, oldest first, for alerting. */
  flowsAfter(wallet: string, block: number): StoredFlow[] {
    const rows = this.db.prepare('SELECT * FROM trading_flows WHERE wallet = ? AND block > ? ORDER BY block ASC LIMIT 50').all(wallet.toLowerCase(), block) as Array<{ tx_hash: string; wallet: string; block: number; at: string; verdict: FlowVerdict; note: string; sent: string }>;
    return rows.map((r) => ({ txHash: r.tx_hash, wallet: r.wallet, block: r.block, at: r.at, verdict: r.verdict, note: r.note, sent: JSON.parse(r.sent) }));
  }

  /** Coverage gaps recorded after a given time. */
  gapsAfter(wallet: string, atIso: string): CoverageGap[] {
    const rows = this.db.prepare('SELECT * FROM trading_gaps WHERE wallet = ? AND at > ? ORDER BY at ASC').all(wallet.toLowerCase(), atIso) as Array<{ wallet: string; from_block: number; to_block: number; at: string }>;
    return rows.map((r) => ({ wallet: r.wallet, fromBlock: r.from_block, toBlock: r.to_block, at: r.at }));
  }

  gaps(wallet: string): CoverageGap[] {
    const rows = this.db.prepare('SELECT * FROM trading_gaps WHERE wallet = ? ORDER BY from_block DESC LIMIT 20').all(wallet.toLowerCase()) as Array<{ wallet: string; from_block: number; to_block: number; at: string }>;
    return rows.map((r) => ({ wallet: r.wallet, fromBlock: r.from_block, toBlock: r.to_block, at: r.at }));
  }
}

interface Row {
  wallet: string;
  agent_key: string | null;
  owners: string;
  owners_signed_at: string | null;
  added_at: string;
  scanned_to: number | null;
  last_scan_at: string | null;
  last_error: string | null;
}

function toWallet(r: Row): WatchedTradingWallet {
  return { wallet: r.wallet, agentKey: r.agent_key, owners: JSON.parse(r.owners), ownersSignedAt: r.owners_signed_at ?? null, addedAt: r.added_at, scannedTo: r.scanned_to, lastScanAt: r.last_scan_at, lastError: r.last_error };
}

const DB_PATH = process.env.TRADING_DB_PATH ?? './data/trading.db';
let store: TradingStore | null = null;

export function getTradingStore(): TradingStore {
  store ??= new TradingStore(DB_PATH);
  return store;
}
