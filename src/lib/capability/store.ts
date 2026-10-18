import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { getWalletActivityStore } from '@/lib/activity/store';
import { countActions, type CapabilityRead, type ChainTx } from './match';

/**
 * Agent wallets' job-shaped transactions, read once a day.
 *
 * From NodeReal's transaction index (`nr_getTransactionByAddress`), which
 * takes ranges under 2,000,000 blocks ending a little behind the head: three
 * such windows, about thirty days. Whether a called contract is a Venus
 * market is asked of the contract itself (`isVToken()`), so isolated pools
 * count without a hand-kept list, and each answer is kept for good.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS capability_reads (
    chain_id   INTEGER NOT NULL,
    wallet     TEXT NOT NULL,
    venus      INTEGER NOT NULL,
    swaps      INTEGER NOT NULL,
    liquidity  INTEGER NOT NULL,
    latest_at  INTEGER,
    days       INTEGER NOT NULL,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (chain_id, wallet)
  );
  CREATE TABLE IF NOT EXISTS venus_markets (
    chain_id INTEGER NOT NULL,
    address  TEXT NOT NULL,
    is_venus INTEGER NOT NULL,
    PRIMARY KEY (chain_id, address)
  );
`;

const WINDOW = 1_999_000;
const WINDOWS = 3;
const INDEX_LAG = 2_000;
const BLOCK_SECONDS = 0.45;
const RECHECK_MS = 24 * 60 * 60_000;
const WALLETS_PER_PASS = 10;

class CapabilityStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  reads(wallet: string): CapabilityRead[] {
    const rows = this.db.prepare('SELECT * FROM capability_reads WHERE wallet = ? ORDER BY chain_id').all(wallet.toLowerCase()) as Array<{ chain_id: number; wallet: string; venus: number; swaps: number; liquidity: number; latest_at: number | null; days: number; checked_at: string }>;
    return rows.map((r) => ({ chainId: r.chain_id, wallet: r.wallet, counts: { venus: r.venus, swaps: r.swaps, liquidity: r.liquidity, latestAt: r.latest_at }, days: r.days, checkedAt: r.checked_at }));
  }

  due(chainId: number, wallet: string, now = Date.now()): boolean {
    const row = this.db.prepare('SELECT checked_at FROM capability_reads WHERE chain_id = ? AND wallet = ?').get(chainId, wallet.toLowerCase()) as { checked_at: string } | undefined;
    return !row || now - Date.parse(row.checked_at) > RECHECK_MS;
  }

  record(read: CapabilityRead): void {
    this.db
      .prepare(
        `INSERT INTO capability_reads (chain_id, wallet, venus, swaps, liquidity, latest_at, days, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chain_id, wallet) DO UPDATE SET venus = excluded.venus, swaps = excluded.swaps, liquidity = excluded.liquidity, latest_at = excluded.latest_at, days = excluded.days, checked_at = excluded.checked_at`,
      )
      .run(read.chainId, read.wallet.toLowerCase(), read.counts.venus, read.counts.swaps, read.counts.liquidity, read.counts.latestAt, read.days, read.checkedAt);
  }

  venusKnown(chainId: number, address: string): boolean | undefined {
    const row = this.db.prepare('SELECT is_venus FROM venus_markets WHERE chain_id = ? AND address = ?').get(chainId, address.toLowerCase()) as { is_venus: number } | undefined;
    return row ? row.is_venus === 1 : undefined;
  }

  rememberVenus(chainId: number, address: string, isVenus: boolean): void {
    this.db.prepare('INSERT OR REPLACE INTO venus_markets (chain_id, address, is_venus) VALUES (?, ?, ?)').run(chainId, address.toLowerCase(), isVenus ? 1 : 0);
  }
}

let store: CapabilityStore | null = null;
export function getCapabilityStore(): CapabilityStore {
  store ??= new CapabilityStore(process.env.CAPABILITY_DB_PATH ?? './data/capability.db');
  return store;
}

const IS_VTOKEN = '0x3d9ea3a1';

function nodereal(chainId: number, apiKey: string) {
  const url = `https://bsc-${chainId === 56 ? 'mainnet' : 'testnet'}.nodereal.io/v1/${apiKey}`;
  return async <T>(method: string, params: unknown[]): Promise<T> => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`NodeReal answered ${response.status}`);
    const payload = (await response.json()) as { result?: T; error?: { message?: string } };
    if (payload.error) throw new Error(`NodeReal: ${payload.error.message ?? 'error'}`);
    return payload.result as T;
  };
}

/** Read one wallet on one chain: about thirty days of its own successful transactions, counted by job. */
async function readWallet(chainId: number, wallet: string, apiKey: string): Promise<CapabilityRead> {
  const rpc = nodereal(chainId, apiKey);
  const hex = (n: number) => `0x${n.toString(16)}`;
  const head = Number.parseInt(await rpc<string>('eth_blockNumber', []), 16) - INDEX_LAG;
  const txs: ChainTx[] = [];
  for (let w = 0; w < WINDOWS; w += 1) {
    const to = head - w * WINDOW;
    const from = Math.max(0, to - WINDOW + 1);
    const result = await rpc<{ transfers?: Array<{ to?: string | null; input?: string; receiptsStatus?: number; blockTimeStamp?: number }> }>('nr_getTransactionByAddress', [
      { category: ['external'], addressType: 'from', address: wallet.toLowerCase(), fromBlock: hex(from), toBlock: hex(to), maxCount: '0x64', order: 'desc' },
    ]);
    for (const t of result?.transfers ?? []) txs.push({ to: t.to ?? null, input: t.input ?? '0x', ok: t.receiptsStatus === 1, at: t.blockTimeStamp ?? 0 });
  }

  const capability = getCapabilityStore();
  const targets = [...new Set(txs.flatMap((t) => (t.ok && t.to ? [t.to.toLowerCase()] : [])))];
  for (const target of targets) {
    if (capability.venusKnown(chainId, target) !== undefined) continue;
    const answer = await rpc<string>('eth_call', [{ to: target, data: IS_VTOKEN }, 'latest']).catch(() => '0x');
    capability.rememberVenus(chainId, target, answer !== '0x' && BigInt(answer) === 1n);
  }
  return {
    chainId,
    wallet: wallet.toLowerCase(),
    counts: countActions(chainId, txs, (address) => capability.venusKnown(chainId, address) === true),
    days: Math.round((WINDOWS * WINDOW * BLOCK_SECONDS) / 86_400),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Read listed agents' wallets, on BNB Chain and, for agents registered
 * there, BNB Testnet. Bounded per pass, daily per wallet, and
 * off without NODEREAL_API_KEY. A failed read is retried, never stored as
 * "not seen".
 */
export async function refreshCapability(agents: ReadonlyArray<{ chainId: number; wallet: string }>): Promise<{ enabled: boolean; read: number; failed: number }> {
  const apiKey = process.env.NODEREAL_API_KEY;
  if (!apiKey) return { enabled: false, read: 0, failed: 0 };
  const capability = getCapabilityStore();
  const plan = agents
    .flatMap((a) => [{ chainId: 56, wallet: a.wallet }, ...(a.chainId === 97 ? [{ chainId: 97, wallet: a.wallet }] : [])])
    .filter((p) => capability.due(p.chainId, p.wallet))
    .slice(0, WALLETS_PER_PASS);
  let read = 0;
  let failed = 0;
  for (const p of plan) {
    try {
      // A wallet the daily activity read shows has never sent anything has no transactions to list.
      const activity = getWalletActivityStore().get(p.chainId, p.wallet);
      if (activity && activity.sent === 0 && !activity.contract) {
        capability.record({ chainId: p.chainId, wallet: p.wallet.toLowerCase(), counts: { venus: 0, swaps: 0, liquidity: 0, latestAt: null }, days: Math.round((WINDOWS * WINDOW * BLOCK_SECONDS) / 86_400), checkedAt: new Date().toISOString() });
        continue;
      }
      capability.record(await readWallet(p.chainId, p.wallet, apiKey));
      read += 1;
    } catch {
      failed += 1;
    }
  }
  return { enabled: true, read, failed };
}
