import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { acceptsProposals, requestAmountLabel, type Brief } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { publicPage } from './marketplace-bot';
import type { ChatKey } from './chat-store';

const DB_PATH = process.env.SCOUT_DB_PATH ?? './data/scout.db';
let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS scout_request_alert_subscriptions (
      chat_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scout_request_alert_outbox (
      chat_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      dropped_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS scout_request_alert_pending ON scout_request_alert_outbox (created_at)
      WHERE sent_at IS NULL AND dropped_at IS NULL;
  `);
  database.prepare('DELETE FROM scout_request_alert_outbox WHERE created_at < ?').run(new Date(Date.now() - 30 * 86_400_000).toISOString());
  return database;
}

export function requestAlertsOn(chatId: ChatKey): boolean {
  const row = db().prepare('SELECT enabled FROM scout_request_alert_subscriptions WHERE chat_id=?').get(String(chatId)) as { enabled: number } | undefined;
  return row?.enabled === 1;
}

export function setRequestAlerts(chatId: ChatKey, enabled: boolean): void {
  if (!enabled) {
    db().prepare('DELETE FROM scout_request_alert_outbox WHERE chat_id=?').run(String(chatId));
    db().prepare('DELETE FROM scout_request_alert_subscriptions WHERE chat_id=?').run(String(chatId));
    return;
  }
  db().prepare(`INSERT INTO scout_request_alert_subscriptions (chat_id,enabled,updated_at) VALUES (?,?,?)
    ON CONFLICT(chat_id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at`)
    .run(String(chatId), 1, new Date().toISOString());
}

/** Only newly posted, public requests enter the queue. Subscribing never replays old work. */
export function queuePublicRequestAlert(brief: Brief): number {
  if (brief.targetBuilder || !acceptsProposals(brief)) return 0;
  const result = db().prepare(`INSERT OR IGNORE INTO scout_request_alert_outbox (chat_id,request_id,created_at)
    SELECT chat_id,?,? FROM scout_request_alert_subscriptions WHERE enabled=1`)
    .run(brief.id, new Date().toISOString());
  return Number(result.changes);
}

export function requestAlertText(brief: Brief): string {
  const network = brief.chainId === 97 ? 'BNB Testnet' : 'BNB Mainnet';
  const budget = requestAmountLabel(brief, brief.budgetU);
  return `New open request on Pokter\n\n${brief.title.slice(0, 180)}\n${network} · Budget ${budget}${brief.chainId === 97 ? ' (test tokens)' : ''}${brief.closesAt ? `\nProposals close ${brief.closesAt.slice(0, 10)}` : ''}\n\nA request is not a funded job. Read the full terms before proposing.`;
}

/**
 * The outbox is shared, the delivery is not: this sender speaks to Telegram.
 * A subscription another transport owns is dropped rather than sent to a chat id
 * that does not exist, so a queue that cannot be delivered never looks sent.
 */
function telegramChat(chatId: string): number | null {
  const id = Number(chatId);
  return /^-?\d{1,19}$/.test(chatId) && Number.isSafeInteger(id) ? id : null;
}

/** Retry undelivered alerts during the existing sweep, with a small per-run cap. */
export async function sendPendingRequestAlerts(limit = 10): Promise<{ sent: number; failed: number; dropped: number }> {
  const result = { sent: 0, failed: 0, dropped: 0 };
  const token = process.env.POKTER_TELEGRAM_BOT_TOKEN;
  if (!token) return result;
  const rows = db().prepare(`SELECT o.chat_id,o.request_id,o.attempts,s.enabled FROM scout_request_alert_outbox o
    LEFT JOIN scout_request_alert_subscriptions s ON s.chat_id=o.chat_id
    WHERE o.sent_at IS NULL AND o.dropped_at IS NULL ORDER BY o.created_at LIMIT ?`).all(Math.max(1, Math.min(limit, 20))) as Array<{ chat_id: string; request_id: string; attempts: number; enabled: number | null }>;
  for (const row of rows) {
    const brief = getBriefStore().get(row.request_id);
    const target = telegramChat(row.chat_id);
    if (target === null || row.enabled !== 1 || !brief || brief.targetBuilder || !acceptsProposals(brief) || row.attempts >= 5) {
      db().prepare('UPDATE scout_request_alert_outbox SET dropped_at=? WHERE chat_id=? AND request_id=?').run(new Date().toISOString(), row.chat_id, row.request_id);
      result.dropped++;
      continue;
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: target, text: requestAlertText(brief),
          reply_markup: { inline_keyboard: [[{ text: 'Review request', url: publicPage(`/requests/${brief.id}`) }], [{ text: 'Turn off alerts', callback_data: 'scout:alerts:off' }]] },
          link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(4_000),
      });
      const delivery = await response.json() as { ok?: boolean; error_code?: number };
      if (!response.ok || delivery.ok !== true) {
        if (delivery.error_code === 403) setRequestAlerts(target, false);
        throw new Error(`Telegram rejected alert: ${response.status}`);
      }
      db().prepare('UPDATE scout_request_alert_outbox SET sent_at=?,attempts=attempts+1 WHERE chat_id=? AND request_id=?').run(new Date().toISOString(), row.chat_id, row.request_id);
      result.sent++;
    } catch {
      db().prepare('UPDATE scout_request_alert_outbox SET attempts=attempts+1 WHERE chat_id=? AND request_id=?').run(row.chat_id, row.request_id);
      result.failed++;
    }
  }
  return result;
}
