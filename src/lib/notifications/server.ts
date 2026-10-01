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
    CREATE TABLE IF NOT EXISTS builder_notifications (
      id TEXT PRIMARY KEY,
      owner_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      job_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      event TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      UNIQUE(owner_address, chain_id, job_id, event)
    );
    CREATE INDEX IF NOT EXISTS idx_builder_notifications_owner
      ON builder_notifications (owner_address, created_at DESC);
    CREATE TABLE IF NOT EXISTS builder_notification_subscriptions (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      owner_address TEXT NOT NULL,
      verification_hash TEXT NOT NULL,
      verified_at TEXT,
      unsubscribed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(email, owner_address)
    );
    CREATE INDEX IF NOT EXISTS idx_builder_notification_subscriptions_owner
      ON builder_notification_subscriptions (owner_address);
    CREATE TABLE IF NOT EXISTS builder_notification_outbox (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      event TEXT NOT NULL,
      provider_id TEXT,
      sent_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(subscription_id, event),
      FOREIGN KEY(subscription_id) REFERENCES builder_notification_subscriptions(id)
    );
  `);
  return database;
}

export interface BuilderNotification {
  id: string;
  chainId: number;
  jobId: string;
  agentName: string;
  event: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

type BuilderJobEvent = { event: string; title: string; body: string };

function builderJobEvents(input: {
  jobId: string; agentName: string; status: string; expiredAt?: bigint;
}): BuilderJobEvent[] {
  const status = input.status.toUpperCase();
  const events: BuilderJobEvent[] = [];
  if (status === 'FUNDED') events.push({ event: 'FUNDED', title: 'New funded job', body: `${input.agentName} has funded work ready for delivery.` });
  if (status === 'SUBMITTED') events.push({ event: 'SUBMITTED', title: 'Delivery awaiting review', body: `Job #${input.jobId} was submitted and is waiting for the buyer.` });
  if (status === 'REJECTED') events.push({ event: 'REJECTED', title: 'Delivery contested', body: `The buyer contested job #${input.jobId}. Review the job evidence.` });
  if (status === 'COMPLETED') events.push({ event: 'COMPLETED', title: 'Escrow released', body: `Job #${input.jobId} completed and its escrow was released.` });
  if (status === 'EXPIRED') events.push({ event: 'EXPIRED', title: 'Delivery deadline passed', body: `Job #${input.jobId} expired before completion.` });
  const secondsLeft = input.expiredAt ? Number(input.expiredAt - BigInt(Math.floor(Date.now() / 1000))) : null;
  if (status === 'FUNDED' && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 86_400) {
    events.push({ event: 'DEADLINE_24H', title: 'Delivery due within 24 hours', body: `Job #${input.jobId} is still funded and approaching its deadline.` });
  }
  return events;
}

export function recordBuilderJobEvent(input: {
  owner: string; chainId: number; jobId: string; agentName: string;
  status: string; expiredAt?: bigint;
}): void {
  const events = builderJobEvents(input);
  const insert = db().prepare(`INSERT OR IGNORE INTO builder_notifications
    (id,owner_address,chain_id,job_id,agent_name,event,title,body,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  for (const event of events) insert.run(
    randomUUID(), input.owner.toLowerCase(), input.chainId, input.jobId,
    input.agentName.slice(0, 120), event.event, event.title, event.body, new Date().toISOString(),
  );
}

export function builderNotifications(owner: string): BuilderNotification[] {
  const rows = db().prepare(`SELECT id,chain_id,job_id,agent_name,event,title,body,created_at,read_at
    FROM builder_notifications WHERE owner_address=? ORDER BY created_at DESC LIMIT 100`).all(
    owner.toLowerCase(),
  ) as unknown as Array<Record<string, string | number | null>>;
  return rows.map((row) => ({
    id: String(row.id), chainId: Number(row.chain_id), jobId: String(row.job_id),
    agentName: String(row.agent_name), event: String(row.event), title: String(row.title),
    body: String(row.body), createdAt: String(row.created_at), readAt: row.read_at ? String(row.read_at) : null,
  }));
}

export function markBuilderNotificationsRead(owner: string, id?: string): number {
  const now = new Date().toISOString();
  const result = id
    ? db().prepare(`UPDATE builder_notifications SET read_at=? WHERE owner_address=? AND id=? AND read_at IS NULL`).run(now, owner.toLowerCase(), id)
    : db().prepare(`UPDATE builder_notifications SET read_at=? WHERE owner_address=? AND read_at IS NULL`).run(now, owner.toLowerCase());
  return Number(result.changes);
}

export interface BuilderEmailStatus {
  configured: boolean;
  verified: boolean;
  emailMasked: string | null;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '••••';
  return `${local.slice(0, 2)}${'•'.repeat(Math.min(Math.max(local.length - 2, 2), 6))}@${domain}`;
}

export function builderEmailStatus(owner: string): BuilderEmailStatus {
  const row = db().prepare(`SELECT email,verified_at,unsubscribed_at
    FROM builder_notification_subscriptions WHERE owner_address=?
    ORDER BY created_at DESC LIMIT 1`).get(owner.toLowerCase()) as
    { email: string; verified_at: string | null; unsubscribed_at: string | null } | undefined;
  if (!row || row.unsubscribed_at) return { configured: false, verified: false, emailMasked: null };
  return { configured: true, verified: Boolean(row.verified_at), emailMasked: maskEmail(row.email) };
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

export async function createBuilderSubscription(input: { email: string; owner: string }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const owner = input.owner.toLowerCase();
  const token = randomBytes(32).toString('base64url');
  const id = randomUUID();
  // A builder wallet has one notification destination. Replacing it revokes
  // older destinations before the new address can be verified.
  db().prepare(`UPDATE builder_notification_subscriptions SET unsubscribed_at=?
    WHERE owner_address=? AND unsubscribed_at IS NULL`).run(new Date().toISOString(), owner);
  db().prepare(`INSERT INTO builder_notification_subscriptions
    (id,email,owner_address,verification_hash,created_at) VALUES (?,?,?,?,?)
    ON CONFLICT(email,owner_address) DO UPDATE SET
      verification_hash=excluded.verification_hash,
      verified_at=NULL,
      unsubscribed_at=NULL,
      created_at=excluded.created_at`).run(id, email, owner, hash(token), new Date().toISOString());
  const verifyUrl = `${appUrl()}/api/notifications/verify?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Confirm Pokter builder alerts',
    idempotencyKey: `builder-verify-${hash(`${email}:${owner}:${token}`).slice(0, 48)}`,
    html: emailShell(`<h1 style="font-size:22px;margin:0 0 12px">Confirm builder alerts</h1><p style="font-size:14px;line-height:1.6;color:#55534d">Receive verified updates when agents owned by your connected wallet get funded work or a job changes state.</p><a href="${verifyUrl}" style="display:inline-block;background:#f3ba2f;color:#171714;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px;margin-top:8px">Confirm alerts</a><p style="font-size:11px;color:#77756d;margin-top:20px">No task content or wallet authority is shared by email. If you did not request this, ignore this message.</p>`),
  });
}

export function verifySubscription(token: string): 'buyer' | 'builder' | null {
  const now = new Date().toISOString();
  const tokenHash = hash(token);
  const buyer = db().prepare(`UPDATE notification_subscriptions SET verified_at=?, unsubscribed_at=NULL
    WHERE verification_hash=? AND verified_at IS NULL`).run(now, tokenHash);
  if (buyer.changes > 0) return 'buyer';
  const builder = db().prepare(`UPDATE builder_notification_subscriptions SET verified_at=?, unsubscribed_at=NULL
    WHERE verification_hash=? AND verified_at IS NULL`).run(now, tokenHash);
  return builder.changes > 0 ? 'builder' : null;
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

export function unsubscribe(token: string): 'buyer' | 'builder' | null {
  const [id, supplied] = token.split('.');
  if (!id || !supplied) return null;
  const expected = createHmac('sha256', unsubscribeSecret()).update(id).digest();
  let actual: Buffer;
  try { actual = Buffer.from(supplied, 'base64url'); } catch { return null; }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const now = new Date().toISOString();
  const buyer = db().prepare('UPDATE notification_subscriptions SET unsubscribed_at=? WHERE id=?').run(now, id);
  if (buyer.changes > 0) return 'buyer';
  const builder = db().prepare('UPDATE builder_notification_subscriptions SET unsubscribed_at=? WHERE id=?').run(now, id);
  return builder.changes > 0 ? 'builder' : null;
}

export async function notifyBuilderJobEvent(input: {
  owner: string; chainId: number; jobId: string; agentName: string;
  status: string; expiredAt?: bigint;
}): Promise<{ attempted: number; sent: number }> {
  recordBuilderJobEvent(input);
  const events = builderJobEvents(input);
  const rows = db().prepare(`SELECT id,email FROM builder_notification_subscriptions
    WHERE owner_address=? AND verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all(
    input.owner.toLowerCase(),
  ) as { id: string; email: string }[];
  let sent = 0;
  for (const row of rows) for (const item of events) {
    const eventKey = `${input.chainId}:${input.jobId}:${item.event}`;
    const proposedId = randomUUID();
    db().prepare(`INSERT OR IGNORE INTO builder_notification_outbox
      (id,subscription_id,event,created_at) VALUES (?,?,?,?)`).run(proposedId, row.id, eventKey, new Date().toISOString());
    const pending = db().prepare(`SELECT id,sent_at FROM builder_notification_outbox
      WHERE subscription_id=? AND event=?`).get(row.id, eventKey) as { id: string; sent_at: string | null };
    if (pending.sent_at) continue;
    const unsubscribeUrl = `${appUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken(row.id))}`;
    try {
      const providerId = await sendEmail({
        to: row.email,
        subject: `Pokter builder alert: ${item.title}`,
        idempotencyKey: `builder-${eventKey}-${row.id}`.slice(0, 256),
        html: emailShell(`<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(item.title)}</h1><p style="font-size:14px;line-height:1.6;color:#55534d">${escapeHtml(item.body)}</p><a href="${appUrl()}/builder" style="display:inline-block;background:#f3ba2f;color:#171714;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px;margin-top:8px">Open builder workspace</a><p style="font-size:11px;color:#77756d;margin-top:22px">Task details are intentionally excluded from email. <a href="${unsubscribeUrl}" style="color:#55534d">Stop builder alerts</a>.</p>`),
      });
      db().prepare('UPDATE builder_notification_outbox SET provider_id=?,sent_at=?,last_error=NULL WHERE id=?').run(providerId, new Date().toISOString(), pending.id);
      sent += 1;
    } catch (error) {
      db().prepare('UPDATE builder_notification_outbox SET last_error=? WHERE id=?').run(String((error as Error).message).slice(0, 500), pending.id);
    }
  }
  return { attempted: rows.length * events.length, sent };
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
