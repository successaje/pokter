import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { GrantedSession } from './types';

/**
 * Persistence for granted sessions.
 *
 * The session *authority* lives on-chain in Altana's KeyStore — this table is
 * only Pokter's index of what it granted, so the UI can list active sessions
 * without scanning the chain. Losing it would not grant anyone anything, and
 * would not stop a revocation from working.
 */
export interface SessionStore {
  record(session: GrantedSession): void;
  markRevoked(id: string, txHash: string | null, at: string): void;
  active(): GrantedSession[];
  all(): GrantedSession[];
  byId(id: string): GrantedSession | null;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id             TEXT PRIMARY KEY,
    agent_chain_id INTEGER NOT NULL,
    agent_token_id TEXT    NOT NULL,
    agent_name     TEXT    NOT NULL,
    wallet_address TEXT    NOT NULL,
    public_key     TEXT    NOT NULL,
    chain_id       INTEGER NOT NULL,
    is_testnet     INTEGER NOT NULL,
    spend_cap_wei  TEXT    NOT NULL,
    period         TEXT    NOT NULL,
    expires_at     TEXT    NOT NULL,
    granted_at     TEXT    NOT NULL,
    grant_tx_hash  TEXT,
    revoked_at     TEXT,
    revoke_tx_hash TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_active
    ON sessions (revoked_at, expires_at);
`;

interface SessionRow {
  id: string;
  agent_chain_id: number;
  agent_token_id: string;
  agent_name: string;
  wallet_address: string;
  public_key: string;
  chain_id: number;
  is_testnet: number;
  spend_cap_wei: string;
  period: string;
  expires_at: string;
  granted_at: string;
  grant_tx_hash: string | null;
  revoked_at: string | null;
  revoke_tx_hash: string | null;
}

function toSession(row: SessionRow): GrantedSession {
  return {
    id: row.id,
    agentChainId: row.agent_chain_id,
    agentTokenId: row.agent_token_id,
    agentName: row.agent_name,
    walletAddress: row.wallet_address as `0x${string}`,
    publicKey: row.public_key as `0x${string}`,
    chainId: row.chain_id,
    isTestnet: row.is_testnet === 1,
    spendCapWei: row.spend_cap_wei,
    period: row.period,
    expiresAt: row.expires_at,
    grantedAt: row.granted_at,
    grantTxHash: row.grant_tx_hash as `0x${string}` | null,
    revokedAt: row.revoked_at,
    revokeTxHash: row.revoke_tx_hash as `0x${string}` | null,
  };
}

class SqliteSessionStore implements SessionStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  record(session: GrantedSession): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions
           (id, agent_chain_id, agent_token_id, agent_name, wallet_address,
            public_key, chain_id, is_testnet, spend_cap_wei, period,
            expires_at, granted_at, grant_tx_hash, revoked_at, revoke_tx_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.agentChainId,
        session.agentTokenId,
        session.agentName,
        session.walletAddress,
        session.publicKey,
        session.chainId,
        session.isTestnet ? 1 : 0,
        session.spendCapWei,
        session.period,
        session.expiresAt,
        session.grantedAt,
        session.grantTxHash,
        session.revokedAt,
        session.revokeTxHash,
      );
  }

  markRevoked(id: string, txHash: string | null, at: string): void {
    this.db
      .prepare('UPDATE sessions SET revoked_at = ?, revoke_tx_hash = ? WHERE id = ?')
      .run(at, txHash, id);
  }

  active(): GrantedSession[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions
          WHERE revoked_at IS NULL AND expires_at > ?
          ORDER BY granted_at DESC`,
      )
      .all(new Date().toISOString()) as unknown as SessionRow[];
    return rows.map(toSession);
  }

  all(): GrantedSession[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY granted_at DESC')
      .all() as unknown as SessionRow[];
    return rows.map(toSession);
  }

  byId(id: string): GrantedSession | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as unknown as SessionRow | undefined;
    return row ? toSession(row) : null;
  }
}

let cached: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (cached) return cached;
  cached = new SqliteSessionStore(
    resolve(process.env.SESSION_DB_PATH ?? './data/sessions.db'),
  );
  return cached;
}
