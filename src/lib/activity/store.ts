import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Address } from 'viem';

import { questClient } from '@/lib/quest/indexer';
import type { WalletActivity } from './reading';

/**
 * Agent wallets' on-chain activity, read once a day.
 *
 * Two cheap reads per wallet: the nonce (transactions it sent) and whether
 * it holds code (a contract wallet, whose nonce means something else). One
 * row per chain and address, replaced on each read.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS wallet_activity (
    chain_id   INTEGER NOT NULL,
    address    TEXT NOT NULL,
    sent       INTEGER NOT NULL,
    contract   INTEGER NOT NULL,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (chain_id, address)
  );
`;

const RECHECK_MS = 24 * 60 * 60_000;
/** Reads per sweep pass, so a slow RPC cannot stall the sweep. */
const PER_PASS = 80;
const BATCH = 10;

class WalletActivityStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  get(chainId: number, address: string): WalletActivity | null {
    const row = this.db
      .prepare('SELECT chain_id, address, sent, contract, checked_at FROM wallet_activity WHERE chain_id = ? AND address = ?')
      .get(chainId, address.toLowerCase()) as { chain_id: number; address: string; sent: number; contract: number; checked_at: string } | undefined;
    return row ? { chainId: row.chain_id, address: row.address, sent: row.sent, contract: row.contract === 1, checkedAt: row.checked_at } : null;
  }

  due(chainId: number, addresses: string[], now = Date.now()): string[] {
    return [...new Set(addresses.map((a) => a.toLowerCase()))].filter((address) => {
      const row = this.get(chainId, address);
      return !row || now - Date.parse(row.checkedAt) > RECHECK_MS;
    });
  }

  record(activity: WalletActivity): void {
    this.db
      .prepare(
        `INSERT INTO wallet_activity (chain_id, address, sent, contract, checked_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(chain_id, address) DO UPDATE SET sent = excluded.sent, contract = excluded.contract, checked_at = excluded.checked_at`,
      )
      .run(activity.chainId, activity.address.toLowerCase(), activity.sent, activity.contract ? 1 : 0, activity.checkedAt);
  }
}

let store: WalletActivityStore | null = null;
export function getWalletActivityStore(): WalletActivityStore {
  store ??= new WalletActivityStore(process.env.WALLET_ACTIVITY_DB_PATH ?? './data/wallet-activity.db');
  return store;
}

/**
 * Read the agent wallets that are due, on BNB Chain for every agent and on
 * BNB Testnet too for agents registered there. A failed read is skipped
 * and tried again next pass, never stored as "no activity".
 */
export async function refreshWalletActivity(agents: Array<{ chainId: number; agentWallet: string | null | undefined }>): Promise<{ read: number; failed: number }> {
  const activity = getWalletActivityStore();
  const wallets = agents.filter((a): a is { chainId: number; agentWallet: string } => Boolean(a.agentWallet) && /^0x[0-9a-fA-F]{40}$/.test(a.agentWallet!) && !/^0x0{40}$/.test(a.agentWallet!));
  const plan = [
    ...activity.due(56, wallets.map((w) => w.agentWallet)).map((address) => ({ chainId: 56 as const, address })),
    ...activity.due(97, wallets.filter((w) => w.chainId === 97).map((w) => w.agentWallet)).map((address) => ({ chainId: 97 as const, address })),
  ].slice(0, PER_PASS);

  let read = 0;
  let failed = 0;
  for (let i = 0; i < plan.length; i += BATCH) {
    await Promise.all(
      plan.slice(i, i + BATCH).map(async ({ chainId, address }) => {
        try {
          const client = questClient(chainId);
          const [sent, code] = await Promise.all([
            client.getTransactionCount({ address: address as Address }),
            client.getCode({ address: address as Address }),
          ]);
          activity.record({ chainId, address, sent, contract: Boolean(code && code !== '0x'), checkedAt: new Date().toISOString() });
          read += 1;
        } catch {
          failed += 1;
        }
      }),
    );
  }
  return { read, failed };
}
