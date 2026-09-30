import 'server-only';

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.NOTIFICATION_DB_PATH ?? './data/notifications.db';
let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS notification_subscriptions (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      job_id TEXT NOT NULL,
      verification_hash TEXT NOT NULL,
      verified_at TEXT,
      unsubscribed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(email, chain_id, job_id)
    );
    CREATE TABLE IF NOT EXISTS notification_outbox (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      event TEXT NOT NULL,
      provider_id TEXT,
      sent_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(subscription_id, event),
      FOREIGN KEY(subscription_id) REFERENCES notification_subscriptions(id)
    );
  `);
  return database;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4311').replace(/\/$/, '');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!key || !from) throw new Error('Email delivery is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'idempotency-key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      reply_to: process.env.NOTIFICATION_REPLY_TO || undefined,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json() as { id?: string; message?: string };
  if (!response.ok || !payload.id) throw new Error(payload.message ?? `Email provider answered ${response.status}.`);
  return payload.id;
}

function emailShell(content: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f3ed;color:#171714;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="font-weight:700;font-size:20px;margin-bottom:24px">Pokter</div><div style="background:#fff;border:1px solid #dedbd1;border-radius:16px;padding:28px">${content}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin-top:18px">Pokter verifies agent evidence and coordinates escrow on BNB Chain. Never share a private key or recovery phrase by email.</p></div></body></html>`;
}

export async function createSubscription(input: {
  email: string; walletAddress: string; chainId: number; jobId: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const now = new Date().toISOString();
  db().prepare(`INSERT INTO notification_subscriptions
    (id,email,wallet_address,chain_id,job_id,verification_hash,created_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(email,chain_id,job_id) DO UPDATE SET
      wallet_address=excluded.wallet_address,
      verification_hash=excluded.verification_hash,
      verified_at=NULL,
      unsubscribed_at=NULL,
      created_at=excluded.created_at`).run(
    id, email, input.walletAddress.toLowerCase(), input.chainId, input.jobId, hash(token), now,
  );
  const verifyUrl = `${appUrl()}/api/notifications/verify?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: `Confirm updates for Pokter job #${input.jobId}`,
    idempotencyKey: `verify-${hash(`${email}:${input.chainId}:${input.jobId}:${token}`).slice(0, 48)}`,
    html: emailShell(`<h1 style="font-size:22px;margin:0 0 12px">Confirm job updates</h1><p style="font-size:14px;line-height:1.6;color:#55534d">You asked Pokter to email you when job #${escapeHtml(input.jobId)} changes.</p><a href="${verifyUrl}" style="display:inline-block;background:#f3ba2f;color:#171714;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px;margin-top:8px">Confirm updates</a><p style="font-size:11px;color:#77756d;margin-top:20px">If you did not request this, ignore this email. No subscription activates until you confirm.</p>`),
  });
}

export function verifySubscription(token: string): boolean {
  const result = db().prepare(`UPDATE notification_subscriptions SET verified_at=?, unsubscribed_at=NULL
    WHERE verification_hash=? AND verified_at IS NULL`).run(new Date().toISOString(), hash(token));
  return result.changes > 0;
}

function unsubscribeSecret(): string {
  // A dedicated secret is preferred. Falling back to the server-only sending
  // credential keeps unsubscribe functional during initial deployment; key
  // rotation then intentionally invalidates outstanding links.
  const secret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET ?? process.env.RESEND_API_KEY;
  if (!secret) throw new Error('Notification unsubscribe secret is not configured.');
  return secret;
}

function unsubscribeToken(id: string): string {
  return `${id}.${createHmac('sha256', unsubscribeSecret()).update(id).digest('base64url')}`;
}

export function unsubscribe(token: string): boolean {
  const [id, supplied] = token.split('.');
  if (!id || !supplied) return false;
  const expected = createHmac('sha256', unsubscribeSecret()).update(id).digest();
  let actual: Buffer;
  try { actual = Buffer.from(supplied, 'base64url'); } catch { return false; }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return db().prepare('UPDATE notification_subscriptions SET unsubscribed_at=? WHERE id=?').run(new Date().toISOString(), id).changes > 0;
}

export async function notifyJobEvent(input: {
  chainId: number; jobId: string; status: string; agentName?: string;
}): Promise<{ attempted: number; sent: number }> {
  const rows = db().prepare(`SELECT id,email FROM notification_subscriptions
    WHERE chain_id=? AND job_id=? AND verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all(input.chainId, input.jobId) as { id: string; email: string }[];
  let sent = 0;
  for (const row of rows) {
    const event = input.status.toUpperCase();
    const proposedId = randomUUID();
    db().prepare(`INSERT OR IGNORE INTO notification_outbox
      (id,subscription_id,event,created_at) VALUES (?,?,?,?)`).run(proposedId, row.id, event, new Date().toISOString());
    const pending = db().prepare(`SELECT id,sent_at FROM notification_outbox
      WHERE subscription_id=? AND event=?`).get(row.id, event) as { id: string; sent_at: string | null };
    if (pending.sent_at) continue;
    const outboxId = pending.id;
    const unsubscribeUrl = `${appUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken(row.id))}`;
    const agent = escapeHtml(input.agentName?.trim() || 'Your agent');
    try {
      const providerId = await sendEmail({
        to: row.email,
        subject: `Pokter job #${input.jobId}: ${event.toLowerCase()}`,
        idempotencyKey: `job-${input.chainId}-${input.jobId}-${event}-${row.id}`.slice(0, 256),
        html: emailShell(`<h1 style="font-size:22px;margin:0 0 12px">Job ${escapeHtml(event.toLowerCase())}</h1><p style="font-size:14px;line-height:1.6;color:#55534d">${agent} has a verified on-chain update for job #${escapeHtml(input.jobId)}.</p><a href="${appUrl()}/my-agents" style="display:inline-block;background:#f3ba2f;color:#171714;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px;margin-top:8px">View activity</a><p style="font-size:11px;color:#77756d;margin-top:22px">Task details are intentionally excluded from email. <a href="${unsubscribeUrl}" style="color:#55534d">Stop updates for this job</a>.</p>`),
      });
      db().prepare('UPDATE notification_outbox SET provider_id=?,sent_at=? WHERE id=?').run(providerId, new Date().toISOString(), outboxId);
      sent += 1;
    } catch (error) {
      db().prepare('UPDATE notification_outbox SET last_error=? WHERE id=?').run(String((error as Error).message).slice(0, 500), outboxId);
    }
  }
  return { attempted: rows.length, sent };
}

export function subscribedJobs(): { chainId: number; jobId: string }[] {
  return db().prepare(`SELECT DISTINCT chain_id,job_id FROM notification_subscriptions
    WHERE verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all().map((row) => {
      const value = row as { chain_id: number; job_id: string };
      return { chainId: value.chain_id, jobId: value.job_id };
    });
}
