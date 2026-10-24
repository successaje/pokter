import 'server-only';

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Address } from 'viem';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { getJobStore } from '@/lib/erc8183/store';
import { jobHref } from '@/lib/jobs/href';
import { chainLabel } from '@/lib/network/presentation';
import { withPublicEndpoint } from '@/lib/proof/prober';
import {
  IDENTITY_CHALLENGE_TTL_MS, notificationIdentityMessage, subscriptionAddress,
  type IdentityPurpose, type IdentityPurposeKind, type NotificationIdentity,
} from '@/lib/notifications/identity';
import { subscriptionPreVerified, type JobUpdateRow } from '@/lib/notifications/job-updates';
import { addressChangePlan, type AddressChangeChoice } from '@/lib/notifications/preferences';
import {
  mergeWatermark, READ_TOKEN_TTL_MS, readTokenUsable, type Watermark,
} from '@/lib/notifications/read-state';
import { answerFromManifest, previewOf } from './answer';
import { agentChanges, type FollowedAgentState } from './agent-changes';
import { siteUrl } from '@/lib/site';
import { CAMPAIGN_ENDS_AT } from '@/lib/campaign/window';
import { dueDeadlineReminder, hireProgressNews, settledWith } from '@/lib/campaign/reminders';
import { alertFor, dropToLiquidation, levelOf, REPEAT_MS, staleDue, type Level } from '@/lib/loan-watch/rules';
import { alertableFlows, coverageNotice } from '@/lib/trading/alerts';

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
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_follows (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      token_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      verification_hash TEXT NOT NULL,
      verified_at TEXT,
      unsubscribed_at TEXT,
      last_state TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(email, chain_id, token_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_follows_agent ON agent_follows (chain_id, token_id);

    CREATE TABLE IF NOT EXISTS campaign_reminders (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      wallet_address TEXT,
      deadline INTEGER NOT NULL,
      progress INTEGER NOT NULL,
      verification_hash TEXT NOT NULL,
      verified_at TEXT,
      unsubscribed_at TEXT,
      created_at TEXT NOT NULL,
      sent TEXT NOT NULL DEFAULT '',
      last_agents INTEGER
    );

    CREATE TABLE IF NOT EXISTS loan_watches (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      threshold REAL NOT NULL,
      verification_hash TEXT NOT NULL,
      verified_at TEXT,
      unsubscribed_at TEXT,
      created_at TEXT NOT NULL,
      level TEXT,
      last_hf REAL,
      last_ok_at TEXT,
      last_alert_at TEXT,
      stale_sent INTEGER NOT NULL DEFAULT 0,
      UNIQUE(email, wallet_address)
    );

    CREATE TABLE IF NOT EXISTS trading_alerts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      verification_hash TEXT NOT NULL,
      verified_at TEXT,
      unsubscribed_at TEXT,
      created_at TEXT NOT NULL,
      alerted_through_block INTEGER,
      gaps_seen_through TEXT,
      UNIQUE(email, wallet_address)
    );

    CREATE TABLE IF NOT EXISTS loan_watch_runs (
      at TEXT NOT NULL,
      watched INTEGER NOT NULL,
      read_ok INTEGER NOT NULL,
      read_failed INTEGER NOT NULL,
      alerts INTEGER NOT NULL
    );
  `);
  // Added after launch; existing rows keep the default (preview only).
  addColumn(database, 'notification_subscriptions', 'include_answer INTEGER NOT NULL DEFAULT 0');
  // When a watched wallet was last tried, read or not: the rotation key, so wallets that fail cannot take every turn.
  addColumn(database, 'loan_watches', 'last_attempt_at TEXT');
  /* When a trading wallet's checks went bad, and when its subscriber was told (`coverageNotice`). */
  addColumn(database, 'trading_alerts', 'coverage_bad_since TEXT');
  addColumn(database, 'trading_alerts', 'coverage_warned_at TEXT');
  return database;
}

/**
 * A column added after a table shipped.
 *
 * `CREATE TABLE IF NOT EXISTS` is a no-op against a database that already
 * has the table, so new columns never arrive that way — an existing
 * deployment would keep the old shape and fail on the first write.
 */
function addColumn(database: DatabaseSync, table: string, definition: string): void {
  try {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (error) {
    if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
  }
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
  if (status === 'REJECTED') events.push({ event: 'REJECTED', title: 'Delivery rejected', body: `The buyer disputed job #${input.jobId}, the escrow policy’s voters rejected the delivery, and the buyer was refunded. Review the job evidence.` });
  if (status === 'COMPLETED') events.push({ event: 'COMPLETED', title: 'Escrow released', body: `Job #${input.jobId} completed and its escrow was released.` });
  if (status === 'EXPIRED') events.push({ event: 'EXPIRED', title: 'Job expired unpaid', body: `Job #${input.jobId} passed its deadline unsettled and the buyer reclaimed it: no delivery, or a delivery nobody settled. Settle approved jobs promptly; anyone can.` });
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
  return siteUrl();
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

function emailShell(content: string, preheader: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f2eb;color:#171714;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2eb"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px"><tr><td style="padding:0 4px 18px"><a href="${appUrl()}" style="color:#171714;text-decoration:none;font-size:20px;font-weight:700;letter-spacing:-.4px"><img src="${appUrl()}/brand/pokter-app-icon-192.png" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;margin-right:9px;border:0;border-radius:8px"><span style="vertical-align:middle">Pokter</span></a></td></tr><tr><td style="background:#ffffff;border:1px solid #dedbd1;border-radius:18px;padding:32px 30px">${content}</td></tr><tr><td style="padding:18px 5px 0;color:#77756d;font-size:11px;line-height:1.65"><p style="margin:0 0 8px">Pokter is the evidence-first marketplace for autonomous financial agents on BNB Chain.</p><p style="margin:0">Security reminder: Pokter will never ask for your private key, recovery phrase, or passkey by email.</p></td></tr></table></td></tr></table></body></html>`;
}

function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#f3ba2f;color:#171714;text-decoration:none;font-size:14px;font-weight:700;padding:13px 19px;border-radius:10px">${escapeHtml(label)}</a>`;
}

function emailContext(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border-collapse:separate;border-spacing:0;background:#f7f6f1;border:1px solid #e7e3d8;border-radius:12px">${rows.map(([label, value], index) => `<tr><td style="padding:${index ? '0 16px 12px' : '13px 16px 12px'};color:#77756d;font-size:11px;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(label)}</td><td align="right" style="padding:${index ? '0 16px 12px' : '13px 16px 12px'};color:#292823;font-size:12px;font-weight:600">${escapeHtml(value)}</td></tr>`).join('')}</table>`;
}

export async function createSubscription(input: {
  email: string; walletAddress: string; chainId: number; jobId: string; includeAnswer?: boolean;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const now = new Date().toISOString();
  db().prepare(`INSERT INTO notification_subscriptions
    (id,email,wallet_address,chain_id,job_id,verification_hash,created_at,include_answer)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(email,chain_id,job_id) DO UPDATE SET
      wallet_address=excluded.wallet_address,
      include_answer=excluded.include_answer,
      verification_hash=excluded.verification_hash,
      verified_at=NULL,
      unsubscribed_at=NULL,
      created_at=excluded.created_at`).run(
    id, email, input.walletAddress.toLowerCase(), input.chainId, input.jobId, hash(token), now, input.includeAnswer ? 1 : 0,
  );
  const verifyUrl = `${appUrl()}/api/notifications/verify?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: `Confirm email updates for job #${input.jobId}`,
    idempotencyKey: `verify-${hash(`${email}:${input.chainId}:${input.jobId}:${token}`).slice(0, 48)}`,
    html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Email verification</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Stay informed about your job</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">Confirm your email to hear when the agent delivers, with a preview of its answer, and when the job settles.</p>${emailContext([['Job', `#${input.jobId}`], ['Network', input.chainId === 97 ? 'BNB Smart Chain Testnet' : chainLabel(input.chainId)]])}<div>${emailButton(verifyUrl, 'Confirm job updates')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">This link only enables notifications. It cannot sign transactions or access your wallet. If you did not request these updates, you can safely ignore this email.</p>`, `Confirm email updates for Pokter job #${input.jobId}.`),
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
    subject: 'Confirm your Pokter builder alerts',
    idempotencyKey: `builder-verify-${hash(`${email}:${owner}:${token}`).slice(0, 48)}`,
    html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Builder notifications</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Keep your agent operations moving</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">Confirm your email to receive essential updates when your agents receive funded work, approach a deadline, or move through delivery review.</p>${emailContext([['Workspace', 'Builder'], ['Source', 'Chain-verified job state']])}<div>${emailButton(verifyUrl, 'Confirm builder alerts')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">Emails never include private task content and this link grants no wallet permissions. If you did not request builder alerts, you can safely ignore this message.</p>`, 'Confirm email alerts for your Pokter builder workspace.'),
  });
}

export type EmailLinkTarget =
  | { kind: 'buyer' | 'builder' | 'campaign' | 'loan-watch' | 'trading' }
  | { kind: 'follow'; chainId: number; tokenId: string };

/** Confirm an address. A follow also says which agent, so the link can return to it. */
export function verifySubscription(token: string): EmailLinkTarget | null {
  const now = new Date().toISOString();
  const tokenHash = hash(token);
  const buyer = db().prepare(`UPDATE notification_subscriptions SET verified_at=?, unsubscribed_at=NULL
    WHERE verification_hash=? AND verified_at IS NULL`).run(now, tokenHash);
  if (buyer.changes > 0) return { kind: 'buyer' };
  const builder = db().prepare(`UPDATE builder_notification_subscriptions SET verified_at=?, unsubscribed_at=NULL
    WHERE verification_hash=? AND verified_at IS NULL`).run(now, tokenHash);
  if (builder.changes > 0) return { kind: 'builder' };
  const campaign = db().prepare(`UPDATE campaign_reminders SET verified_at=?, unsubscribed_at=NULL
    WHERE verification_hash=? AND verified_at IS NULL`).run(now, tokenHash);
  if (campaign.changes > 0) return { kind: 'campaign' };
  const loan = db().prepare(`UPDATE loan_watches SET verified_at=?, unsubscribed_at=NULL
    WHERE verification_hash=? AND verified_at IS NULL`).run(now, tokenHash);
  if (loan.changes > 0) return { kind: 'loan-watch' };
  const trading = db().prepare(`UPDATE trading_alerts SET verified_at=?, unsubscribed_at=NULL
    WHERE verification_hash=? AND verified_at IS NULL`).run(now, tokenHash);
  if (trading.changes > 0) return { kind: 'trading' };
  const follow = db().prepare(`SELECT id, chain_id, token_id FROM agent_follows WHERE verification_hash=? AND verified_at IS NULL`).get(tokenHash) as
    | { id: string; chain_id: number; token_id: string }
    | undefined;
  if (!follow) return null;
  db().prepare('UPDATE agent_follows SET verified_at=?, unsubscribed_at=NULL WHERE id=?').run(now, follow.id);
  return { kind: 'follow', chainId: follow.chain_id, tokenId: follow.token_id };
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

export function unsubscribe(token: string): EmailLinkTarget | null {
  const [id, supplied] = token.split('.');
  if (!id || !supplied) return null;
  const expected = createHmac('sha256', unsubscribeSecret()).update(id).digest();
  let actual: Buffer;
  try { actual = Buffer.from(supplied, 'base64url'); } catch { return null; }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const now = new Date().toISOString();
  const buyer = db().prepare('UPDATE notification_subscriptions SET unsubscribed_at=? WHERE id=?').run(now, id);
  if (buyer.changes > 0) return { kind: 'buyer' };
  const builder = db().prepare('UPDATE builder_notification_subscriptions SET unsubscribed_at=? WHERE id=?').run(now, id);
  if (builder.changes > 0) return { kind: 'builder' };
  const campaign = db().prepare('UPDATE campaign_reminders SET unsubscribed_at=? WHERE id=?').run(now, id);
  if (campaign.changes > 0) return { kind: 'campaign' };
  const loan = db().prepare('UPDATE loan_watches SET unsubscribed_at=? WHERE id=?').run(now, id);
  if (loan.changes > 0) return { kind: 'loan-watch' };
  const trading = db().prepare('UPDATE trading_alerts SET unsubscribed_at=? WHERE id=?').run(now, id);
  if (trading.changes > 0) return { kind: 'trading' };
  const follow = db().prepare('SELECT chain_id, token_id FROM agent_follows WHERE id=?').get(id) as { chain_id: number; token_id: string } | undefined;
  if (!follow) return null;
  db().prepare('UPDATE agent_follows SET unsubscribed_at=? WHERE id=?').run(now, id);
  return { kind: 'follow', chainId: follow.chain_id, tokenId: follow.token_id };
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
        subject: `${item.title} · Job #${input.jobId}`,
        idempotencyKey: `builder-${eventKey}-${row.id}`.slice(0, 256),
        html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Builder update</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">${escapeHtml(item.title)}</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">${escapeHtml(item.body)}</p>${emailContext([['Agent', input.agentName], ['Job', `#${input.jobId}`], ['Network', input.chainId === 97 ? 'BNB Smart Chain Testnet' : chainLabel(input.chainId)]])}<div>${emailButton(`${appUrl()}/build`, 'Open Builder Studio')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">For privacy, task instructions and deliverables are not included in email. <a href="${unsubscribeUrl}" style="color:#55534d;text-decoration:underline">Turn off builder alerts</a>.</p>`, `${item.title} for ${input.agentName}, job #${input.jobId}.`),
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
  const rows = db().prepare(`SELECT id,email,include_answer FROM notification_subscriptions
    WHERE chain_id=? AND job_id=? AND verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all(input.chainId, input.jobId) as { id: string; email: string; include_answer: number }[];
  if (rows.length === 0) return { attempted: 0, sent: 0 };
  const event = input.status.toUpperCase();
  const agent = input.agentName?.trim() || 'Your agent';
  const delivered = event === 'SUBMITTED' || event === 'COMPLETED';
  // Read once for every subscriber: the delivered answer, when there is one.
  const answer = delivered ? await deliveredAnswer(input.chainId, input.jobId).catch(() => null) : null;
  const jobUrl = `${appUrl()}${jobHref({ jobId: encodeURIComponent(input.jobId), chainId: input.chainId })}`;
  const network = input.chainId === 97 ? 'BNB Smart Chain Testnet' : chainLabel(input.chainId);
  const copy: Record<string, { subject: string; title: string; body: string }> = {
    FUNDED: { subject: `Job #${input.jobId} is funded`, title: 'Your job is funded', body: `${agent} has been asked to do the work. You will hear when it delivers.` },
    SUBMITTED: { subject: `${agent} delivered job #${input.jobId}`, title: `${agent} delivered`, body: 'The answer is ready to review. You can dispute it while the review window is open. After it closes, release the payment before the job’s deadline: a job nobody releases expires, the escrow returns to you and the agent is not paid. You will get a reminder when release opens.' },
    COMPLETED: { subject: `Job #${input.jobId} is complete`, title: 'Job complete', body: 'The escrow was released to the agent.' },
    REJECTED: { subject: `Job #${input.jobId} was rejected`, title: 'Delivery rejected', body: 'The escrow policy’s voters rejected the delivery and the job was settled, which refunded your escrow to the wallet that funded it. The agent was not paid.' },
    EXPIRED: { subject: `Job #${input.jobId} expired`, title: 'Escrow reclaimed', body: 'The deadline passed with the job unsettled, and the escrow was reclaimed to the wallet that funded it.' },
  };
  const text = copy[event] ?? { subject: `Job #${input.jobId} is now ${event.toLowerCase()}`, title: `Job ${event.toLowerCase()}`, body: 'A verified on-chain status change is available for your job.' };
  let sent = 0;
  for (const row of rows) {
    const proposedId = randomUUID();
    db().prepare(`INSERT OR IGNORE INTO notification_outbox
      (id,subscription_id,event,created_at) VALUES (?,?,?,?)`).run(proposedId, row.id, event, new Date().toISOString());
    const pending = db().prepare(`SELECT id,sent_at FROM notification_outbox
      WHERE subscription_id=? AND event=?`).get(row.id, event) as { id: string; sent_at: string | null };
    if (pending.sent_at) continue;
    const outboxId = pending.id;
    const answerBlock = answer && event === 'SUBMITTED'
      ? row.include_answer
        ? `<p style="margin:22px 0 8px;color:#77756d;font-size:11px;text-transform:uppercase;letter-spacing:.08em">The agent's answer</p><pre style="white-space:pre-wrap;word-break:break-word;margin:0;padding:14px 16px;background:#f7f6f1;border:1px solid #e7e3d8;border-radius:12px;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.6;color:#292823">${escapeHtml(answer.slice(0, 20_000))}${answer.length > 20_000 ? '\n…' : ''}</pre>`
        : `<p style="margin:22px 0 8px;color:#77756d;font-size:11px;text-transform:uppercase;letter-spacing:.08em">Preview</p><p style="margin:0;padding:14px 16px;background:#f7f6f1;border:1px solid #e7e3d8;border-radius:12px;font-size:13px;line-height:1.65;color:#292823">${escapeHtml(previewOf(answer))}</p>`
      : '';
    try {
      // Inside the try: a missing secret skips this email, not the rest.
      const unsubscribeUrl = `${appUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken(row.id))}`;
      const providerId = await sendEmail({
        to: row.email,
        subject: text.subject,
        idempotencyKey: `job-${input.chainId}-${input.jobId}-${event}-${row.id}`.slice(0, 256),
        html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Job update</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">${escapeHtml(text.title)}</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">${escapeHtml(text.body)}</p>${answerBlock}${emailContext([['Agent', agent], ['Job', `#${input.jobId}`], ['Status', event], ['Network', network]])}<div>${emailButton(jobUrl, delivered ? 'Read and verify the answer' : 'Open the job')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">The job page holds the full answer and checks it against the hash committed on chain. <a href="${unsubscribeUrl}" style="color:#55534d;text-decoration:underline">Stop updates for this job</a>.</p>`, `${text.title} · job #${input.jobId}.`),
      });
      db().prepare('UPDATE notification_outbox SET provider_id=?,sent_at=? WHERE id=?').run(providerId, new Date().toISOString(), outboxId);
      sent += 1;
    } catch (error) {
      db().prepare('UPDATE notification_outbox SET last_error=? WHERE id=?').run(String((error as Error).message).slice(0, 500), outboxId);
    }
  }
  return { attempted: rows.length, sent };
}

/**
 * Remind a job's subscribers that its payment can be released, or must be
 * before the deadline (`releaseReminderDue`). One email per subscriber per
 * reminder, through the same outbox as every other job email, so a sweep
 * that runs twice inside the window sends it once.
 */
export async function notifyReleaseReminder(input: {
  chainId: number; jobId: string; event: 'RELEASE_OPEN' | 'RELEASE_CLOSING'; closesAt: number; agentName?: string;
}): Promise<{ attempted: number; sent: number }> {
  const rows = db().prepare(`SELECT id,email FROM notification_subscriptions
    WHERE chain_id=? AND job_id=? AND verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all(input.chainId, input.jobId) as { id: string; email: string }[];
  if (rows.length === 0) return { attempted: 0, sent: 0 };
  const agent = input.agentName?.trim() || 'Your agent';
  const jobUrl = `${appUrl()}${jobHref({ jobId: encodeURIComponent(input.jobId), chainId: input.chainId })}`;
  const deadline = `${new Date(input.closesAt).toUTCString().slice(5, 22)} UTC`;
  const closing = input.event === 'RELEASE_CLOSING';
  const text = closing
    ? { subject: `Release job #${input.jobId} before ${deadline}`, title: 'Release closes soon', body: `${agent} delivered job #${input.jobId} and the review window has closed with no dispute, but nobody has released the payment. If it is still unreleased at ${deadline}, the job expires: the escrow returns to you and the agent is not paid for its work.` }
    : { subject: `You can release job #${input.jobId} now`, title: 'Release is open', body: `The review window for job #${input.jobId} has closed with no dispute. Release the payment to ${agent} from the job page before ${deadline}. After that the job expires, the escrow returns to you and the agent is not paid.` };
  let sent = 0;
  for (const row of rows) {
    db().prepare(`INSERT OR IGNORE INTO notification_outbox
      (id,subscription_id,event,created_at) VALUES (?,?,?,?)`).run(randomUUID(), row.id, input.event, new Date().toISOString());
    const pending = db().prepare(`SELECT id,sent_at FROM notification_outbox
      WHERE subscription_id=? AND event=?`).get(row.id, input.event) as { id: string; sent_at: string | null };
    if (pending.sent_at) continue;
    try {
      const unsubscribeUrl = `${appUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken(row.id))}`;
      const providerId = await sendEmail({
        to: row.email,
        subject: text.subject,
        idempotencyKey: `job-${input.chainId}-${input.jobId}-${input.event}-${row.id}`.slice(0, 256),
        html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Job update</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">${escapeHtml(text.title)}</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">${escapeHtml(text.body)}</p>${emailContext([['Agent', agent], ['Job', `#${input.jobId}`], ['Release by', deadline]])}<div>${emailButton(jobUrl, 'Open the job and release')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">Releasing pays the agent from escrow and cannot be undone. <a href="${unsubscribeUrl}" style="color:#55534d;text-decoration:underline">Stop updates for this job</a>.</p>`, `${text.title} · job #${input.jobId}.`),
      });
      db().prepare('UPDATE notification_outbox SET provider_id=?,sent_at=? WHERE id=?').run(providerId, new Date().toISOString(), pending.id);
      sent += 1;
    } catch (error) {
      db().prepare('UPDATE notification_outbox SET last_error=? WHERE id=?').run(String((error as Error).message).slice(0, 500), pending.id);
    }
  }
  return { attempted: rows.length, sent };
}

/**
 * The delivered answer for a job: from the manifest Pokter's own seller
 * stored, or fetched from the delivery URL the index recorded, over the
 * same pinned, size-capped fetch the prober uses.
 */
async function deliveredAnswer(chainId: number, jobId: string): Promise<string | null> {
  // Deliverables Pokter hosts: its delivery agent's (testnet) and builders'
  // Studio deliveries (any escrow).
  const stored = readDeliverable(deliverableKey(chainId, jobId));
  if (stored) return answerFromManifest(stored.manifestText);
  const url = getJobStore().byId(`${chainId}:${jobId}`)?.deliverableUrl;
  if (!url) return null;
  const text = await withPublicEndpoint(url, async (endpoint) => {
    const response = await endpoint.fetch({ cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`The delivery answered ${response.status}.`);
    const body = await response.text();
    return body.slice(0, 256 * 1024);
  });
  return answerFromManifest(text);
}

export function subscribedJobs(): { chainId: number; jobId: string }[] {
  return db().prepare(`SELECT DISTINCT chain_id,job_id FROM notification_subscriptions
    WHERE verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all().map((row) => {
      const value = row as { chain_id: number; job_id: string };
      return { chainId: value.chain_id, jobId: value.job_id };
    });
}

/** Start following an agent by email. Nothing is sent about it until the address is confirmed. */
export async function createAgentFollow(input: { email: string; chainId: number; tokenId: string; agentName: string }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(32).toString('base64url');
  db().prepare(`INSERT INTO agent_follows (id,email,chain_id,token_id,agent_name,verification_hash,created_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(email,chain_id,token_id) DO UPDATE SET
      agent_name=excluded.agent_name,
      verification_hash=excluded.verification_hash,
      verified_at=NULL,
      unsubscribed_at=NULL,
      last_state=NULL,
      created_at=excluded.created_at`).run(randomUUID(), email, input.chainId, input.tokenId, input.agentName, hash(token), new Date().toISOString());
  const verifyUrl = `${appUrl()}/api/notifications/verify?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: `Confirm alerts for ${input.agentName}`,
    idempotencyKey: `follow-verify-${hash(`${email}:${input.chainId}:${input.tokenId}:${token}`).slice(0, 48)}`,
    html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Follow an agent</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Confirm alerts for ${escapeHtml(input.agentName)}</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">You will hear when it stops answering or comes back, changes its signed price, or delivers or misses a paid job. Only what Pokter measures, never marketing.</p>${emailContext([['Agent', input.agentName], ['Network', input.chainId === 97 ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain']])}<div>${emailButton(verifyUrl, 'Confirm alerts')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">This link only turns on alerts. If you did not ask for them, ignore this email.</p>`, `Confirm alerts for ${input.agentName} on Pokter.`),
  });
}

/** Agents with at least one confirmed follower. */
export function followedAgents(): { chainId: number; tokenId: string }[] {
  return (db().prepare(`SELECT DISTINCT chain_id, token_id FROM agent_follows WHERE verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all() as { chain_id: number; token_id: string }[])
    .map((r) => ({ chainId: r.chain_id, tokenId: r.token_id }));
}

/**
 * Compare each followed agent with what its followers last heard, and email
 * what changed. A follower's first observation is stored silently as the
 * baseline. The state is stored after each send, so an email is not repeated.
 */
export async function notifyFollowers(states: Map<string, { name: string; state: FollowedAgentState }>): Promise<{ checked: number; sent: number }> {
  const rows = db().prepare(`SELECT id,email,chain_id,token_id,agent_name,last_state FROM agent_follows
    WHERE verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all() as { id: string; email: string; chain_id: number; token_id: string; agent_name: string; last_state: string | null }[];
  let sent = 0;
  for (const row of rows) {
    const current = states.get(`${row.chain_id}:${row.token_id}`);
    if (!current) continue;
    const previous = row.last_state ? (JSON.parse(row.last_state) as FollowedAgentState) : null;
    const changes = agentChanges(current.name || row.agent_name, previous, current.state);
    const agentUrl = `${appUrl()}/agents/${row.chain_id}/${encodeURIComponent(row.token_id)}`;
    if (changes.length > 0) {
      const items = changes.map((c) => `<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#171714">${escapeHtml(c.title)}</p><p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#55534d">${escapeHtml(c.body)}</p>`).join('');
      try {
        // Inside the try: without email configured this throws, and that must
        // skip this follower, not end the whole pass.
        const unsubscribeUrl = `${appUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken(row.id))}`;
        await sendEmail({
          to: row.email,
          subject: changes.length === 1 ? changes[0].title : `${changes.length} updates on ${current.name || row.agent_name}`,
          idempotencyKey: `follow-${row.id}-${hash(JSON.stringify(current.state)).slice(0, 24)}`,
          html: emailShell(`<p style="margin:0 0 14px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Agent you follow</p>${items}<div>${emailButton(agentUrl, 'See the evidence')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">Measured by Pokter&rsquo;s probes and BNB Chain escrow. <a href="${unsubscribeUrl}" style="color:#55534d;text-decoration:underline">Stop following this agent</a>.</p>`, changes[0].title),
        });
        sent += 1;
      } catch {
        continue; // Keep the old state, so the change is sent on the next sweep.
      }
    }
    db().prepare('UPDATE agent_follows SET last_state=?, agent_name=? WHERE id=?').run(JSON.stringify(current.state), current.name || row.agent_name, row.id);
  }
  return { checked: rows.length, sent };
}

/* ---------------------------------------------------------------------- *
 * Set and Earn reminders
 *
 * One row per inbox. Deadline reminders need nothing but the email;
 * progress emails also need a wallet, whose hires are public on chain
 * anyway (the /quest page reads any address). Nothing is sent until the
 * address is confirmed, and every email carries its own unsubscribe link.
 * ---------------------------------------------------------------------- */

export async function createCampaignReminder(input: { email: string; wallet: string | null; deadline: boolean; progress: boolean }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  db().prepare(`INSERT INTO campaign_reminders (id,email,wallet_address,deadline,progress,verification_hash,created_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET
      wallet_address=excluded.wallet_address,
      deadline=excluded.deadline,
      progress=excluded.progress,
      verification_hash=excluded.verification_hash,
      verified_at=NULL,
      unsubscribed_at=NULL,
      last_agents=NULL,
      created_at=excluded.created_at`).run(randomUUID(), email, input.wallet?.toLowerCase() ?? null, input.deadline ? 1 : 0, input.progress && input.wallet ? 1 : 0, hash(token), now);
  const verifyUrl = `${appUrl()}/api/notifications/verify?token=${encodeURIComponent(token)}`;
  const what = [input.deadline ? 'a reminder a week, two days and one day before entries close' : null, input.progress && input.wallet ? 'an email when this wallet hires another agent' : null].filter(Boolean).join(', and ');
  await sendEmail({
    to: email,
    subject: 'Confirm your Set and Earn reminders',
    idempotencyKey: `campaign-verify-${hash(`${email}:${token}`).slice(0, 48)}`,
    html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">BNB Chain · Set and Earn</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Confirm your reminders</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">You asked for ${escapeHtml(what)}. Pokter reads hires from BNB Chain's escrow contracts; BNB Chain decides who qualifies.</p>${emailContext([['Entries close', CAMPAIGN_ENDS_AT.toUTCString().replace(':00 GMT', ' UTC')], ...(input.wallet ? ([['Wallet', `${input.wallet.slice(0, 6)}…${input.wallet.slice(-4)}`]] as Array<[string, string]>) : [])])}<div>${emailButton(verifyUrl, 'Confirm reminders')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">This link only turns on reminders. It grants no wallet permission. If you did not ask for them, ignore this email.</p>`, 'Confirm your Set and Earn reminders on Pokter.'),
  });
}

/**
 * The sweep's pass: each confirmed subscription gets the deadline reminder
 * that has come due, and, when it watches a wallet, an email the first time
 * its count of distinct hired agents rises. A failed send is retried next
 * sweep; what was sent is recorded after each send.
 */
export async function notifyCampaignReminders(input: {
  nowMs: number;
  endsAtMs: number;
  hiresOf: (wallet: string) => Promise<{ distinctAgents: number; marketplaces: string[] }>;
  maxProgressReads?: number;
}): Promise<{ checked: number; sent: number }> {
  const rows = db().prepare(`SELECT id,email,wallet_address,deadline,progress,created_at,sent,last_agents FROM campaign_reminders
    WHERE verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all() as Array<{ id: string; email: string; wallet_address: string | null; deadline: number; progress: number; created_at: string; sent: string; last_agents: number | null }>;
  let sent = 0;
  let reads = 0;
  for (const row of rows) {
    const unsubscribeUrl = () => `${appUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken(row.id))}`;
    const pageUrl = `${appUrl()}/set-and-earn${row.wallet_address ? `?address=${row.wallet_address}` : ''}`;
    const footer = () => `<p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">BNB Chain's rules decide who qualifies; Pokter shows what it can read on chain. <a href="${unsubscribeUrl()}" style="color:#55534d;text-decoration:underline">Stop these reminders</a>.</p>`;

    if (row.deadline) {
      const due = dueDeadlineReminder({ nowMs: input.nowMs, endsAtMs: input.endsAtMs, subscribedAtMs: Date.parse(row.created_at), sent: row.sent.split(',').filter(Boolean) });
      if (due) {
        try {
          const hours = Math.max(1, Math.round((input.endsAtMs - input.nowMs) / 3_600_000));
          await sendEmail({
            to: row.email,
            subject: `Set and Earn: ${due.label.toLowerCase()}`,
            idempotencyKey: `campaign-${row.id}-${due.id}`,
            html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">BNB Chain · Set and Earn</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">${escapeHtml(due.label)}</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">Entries close in about ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`}. Your agent needs actions on three separate days, so the build track cannot be finished on the last one.</p>${emailContext([['Entries close', new Date(input.endsAtMs).toUTCString().replace(':00 GMT', ' UTC')]])}<div>${emailButton(pageUrl, 'See your progress')}</div>${footer()}`, `${due.label} to complete Set and Earn.`),
          });
          sent += 1;
          db().prepare('UPDATE campaign_reminders SET sent=? WHERE id=?').run(settledWith(due).join(','), row.id);
        } catch {
          /* Not recorded as sent: tried again next sweep. */
        }
      }
    }

    if (row.progress && row.wallet_address && reads < (input.maxProgressReads ?? 20)) {
      reads += 1;
      const now = await input.hiresOf(row.wallet_address).catch(() => null);
      if (!now) continue;
      if (hireProgressNews(row.last_agents, now.distinctAgents)) {
        try {
          const left = Math.max(0, 3 - now.distinctAgents);
          await sendEmail({
            to: row.email,
            subject: left === 0 ? 'Set and Earn: three agents hired' : `Set and Earn: ${now.distinctAgents} of 3 agents hired`,
            idempotencyKey: `campaign-${row.id}-agents-${now.distinctAgents}`,
            html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">BNB Chain · Set and Earn</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">${now.distinctAgents} of 3 different agents hired</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">${left === 0 ? 'The hire count is met. The track also needs at least two marketplaces.' : `${left} more to go, on at least two marketplaces.`}</p>${emailContext([['Marketplaces named', now.marketplaces.length ? now.marketplaces.join(', ') : 'None recorded yet']])}<div>${emailButton(pageUrl, 'See your progress')}</div>${footer()}`, `${now.distinctAgents} of 3 agents hired for Set and Earn.`),
          });
          sent += 1;
        } catch {
          continue; // Keep the old count, so this is sent next sweep.
        }
      }
      db().prepare('UPDATE campaign_reminders SET last_agents=? WHERE id=?').run(now.distinctAgents, row.id);
    }
  }
  return { checked: rows.length, sent };
}

/* ---------------------------------------------------------------------- *
 * Venus liquidation alerts
 *
 * One row per inbox and wallet. The position is public on chain, so a
 * watch proves the inbox, not the wallet: anyone may be told about any
 * position, exactly as anyone may read it. Nothing is sent until the inbox
 * is confirmed, and every email can stop the watch in one click.
 * ---------------------------------------------------------------------- */

export async function createLoanWatch(input: { email: string; wallet: string; threshold: number }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const wallet = input.wallet.toLowerCase();
  const token = randomBytes(32).toString('base64url');
  db().prepare(`INSERT INTO loan_watches (id,email,wallet_address,threshold,verification_hash,created_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(email,wallet_address) DO UPDATE SET
      threshold=excluded.threshold,
      verification_hash=excluded.verification_hash,
      verified_at=NULL,
      unsubscribed_at=NULL,
      level=NULL,
      last_alert_at=NULL,
      stale_sent=0,
      created_at=excluded.created_at`).run(randomUUID(), email, wallet, input.threshold, hash(token), new Date().toISOString());
  const verifyUrl = `${appUrl()}/api/notifications/verify?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Confirm your Venus liquidation alerts',
    idempotencyKey: `loan-verify-${hash(`${email}:${wallet}:${token}`).slice(0, 48)}`,
    html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Venus liquidation alerts</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Confirm your alerts</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">Pokter will read this Venus Core Pool position about every ten minutes and email you when its health factor falls below ${input.threshold.toFixed(2)}, again if it gets worse, and once it recovers.</p>${emailContext([['Wallet', `${input.wallet.slice(0, 6)}…${input.wallet.slice(-4)}`], ['Alert below', input.threshold.toFixed(2)]])}<div>${emailButton(verifyUrl, 'Confirm alerts')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">This link only turns on alerts. It grants no wallet permission, and Pokter never moves funds. If you did not ask for this, ignore this email.</p>`, 'Confirm your Venus liquidation alerts on Pokter.'),
  });
}

/**
 * The sweep's pass over confirmed watches: read each position, email when
 * the alert policy (loan-watch/rules.ts) calls for it, warn once when a
 * position has gone unread too long, and record the run so the page can say
 * how reliable this has been. Reads are shared per wallet.
 */
export async function notifyLoanWatches(input: {
  nowMs: number;
  read: (wallet: string) => Promise<{ healthFactor: number | null; borrowUsd: number; block: bigint }>;
  maxWallets?: number;
}): Promise<{ watched: number; readOk: number; readFailed: number; alerts: number }> {
  /*
   * Least recently tried first, whether or not that try succeeded. Ordering
   * by last success put every wallet that had never been read at the front
   * of every run, so enough unreadable wallets would take every turn and the
   * rest would never be read at all.
   */
  const rows = db().prepare(`SELECT id,email,wallet_address,threshold,created_at,level,last_hf,last_ok_at,last_alert_at,stale_sent FROM loan_watches
    WHERE verified_at IS NOT NULL AND unsubscribed_at IS NULL ORDER BY last_attempt_at IS NOT NULL, last_attempt_at, created_at`).all() as Array<{ id: string; email: string; wallet_address: string; threshold: number; created_at: string; level: string | null; last_hf: number | null; last_ok_at: string | null; last_alert_at: string | null; stale_sent: number }>;
  const wallets = [...new Set(rows.map((r) => r.wallet_address))].slice(0, input.maxWallets ?? 60);
  const readings = new Map<string, Awaited<ReturnType<typeof input.read>> | null>();
  for (const wallet of wallets) {
    readings.set(wallet, await input.read(wallet).catch(() => null));
    db().prepare('UPDATE loan_watches SET last_attempt_at=? WHERE wallet_address=?').run(new Date(input.nowMs).toISOString(), wallet);
  }
  let alerts = 0;
  const nowIso = new Date(input.nowMs).toISOString();
  for (const row of rows) {
    if (!readings.has(row.wallet_address)) continue; // not read this run (over the cap): next run
    const reading = readings.get(row.wallet_address) ?? null;
    const unsubscribeUrl = `${appUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken(row.id))}`;
    const pageUrl = `${appUrl()}/watch?wallet=${row.wallet_address}`;
    const short = `${row.wallet_address.slice(0, 6)}…${row.wallet_address.slice(-4)}`;
    const footer = `<p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">Read by Pokter from Venus's own accounting. Email can be delayed; do not rely on it alone. Pokter never moves funds. <a href="${unsubscribeUrl}" style="color:#55534d;text-decoration:underline">Stop watching this position</a>.</p>`;
    if (!reading) {
      if (staleDue({ lastOkAtMs: row.last_ok_at ? Date.parse(row.last_ok_at) : null, createdAtMs: Date.parse(row.created_at), nowMs: input.nowMs, staleSent: row.stale_sent === 1 })) {
        try {
          await sendEmail({
            to: row.email,
            subject: `Pokter cannot read your Venus position (${short})`,
            idempotencyKey: `loan-${row.id}-stale-${row.last_ok_at ?? 'never'}`,
            html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Venus liquidation alerts</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">We cannot see this position right now</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">For two hours Pokter has not been able to read it from BNB Chain, so an alert could be missed. Check it yourself until this clears; we will say nothing more about it unless the position changes.</p>${emailContext([['Wallet', short], ['Last good reading', row.last_ok_at ? new Date(row.last_ok_at).toUTCString().replace(' GMT', ' UTC') : 'None yet']])}<div>${emailButton(pageUrl, 'Check it now')}</div>${footer}`, 'Pokter cannot read your Venus position right now.'),
          });
          db().prepare('UPDATE loan_watches SET stale_sent=1 WHERE id=?').run(row.id);
          alerts += 1;
        } catch {
          /* Tried again next run. */
        }
      }
      continue;
    }
    const previous = (row.level as Level | null) ?? null;
    const next = levelOf(reading.healthFactor, row.threshold, previous);
    const alert = alertFor({ previous, next, lastAlertAtMs: row.last_alert_at ? Date.parse(row.last_alert_at) : null, nowMs: input.nowMs });
    let alertedAt = row.last_alert_at;
    if (alert) {
      const hf = reading.healthFactor;
      const drop = dropToLiquidation(hf);
      const headline =
        alert === 'recovered'
          ? `Back above ${row.threshold.toFixed(2)}`
          : next === 'liquidatable'
            ? 'This position can be liquidated now'
            : next === 'danger'
              ? 'Close to liquidation'
              : `Below your ${row.threshold.toFixed(2)} threshold`;
      try {
        await sendEmail({
          to: row.email,
          subject: `${headline}: health factor ${hf?.toFixed(3) ?? '—'} (${short})`,
          idempotencyKey: `loan-${row.id}-${alert}-${next}-${Math.floor(input.nowMs / REPEAT_MS)}`,
          html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Venus liquidation alerts</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">${escapeHtml(headline)}</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">${alert === 'recovered' ? 'The health factor has recovered. We will email again if it falls back under your threshold.' : drop !== null && drop > 0 ? `Liquidation if all collateral falls about ${(drop * 100).toFixed(1)}% together. Repaying debt or adding collateral raises it.` : 'Venus reports a shortfall: the position can be liquidated.'}</p>${emailContext([['Health factor', hf?.toFixed(3) ?? 'No debt'], ['Your threshold', row.threshold.toFixed(2)], ['Debt', `$${reading.borrowUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`], ['Block', String(reading.block)]])}<div>${emailButton(pageUrl, 'See the position')}</div>${footer}`, `${headline}: health factor ${hf?.toFixed(3) ?? '—'}.`),
        });
        alerts += 1;
        alertedAt = nowIso;
      } catch {
        continue; // Keep the old level, so this is sent next run.
      }
    }
    db().prepare('UPDATE loan_watches SET level=?, last_hf=?, last_ok_at=?, last_alert_at=?, stale_sent=0 WHERE id=?').run(next, reading.healthFactor, nowIso, alertedAt, row.id);
  }
  const readOk = [...readings.values()].filter(Boolean).length;
  const result = { watched: rows.length, readOk, readFailed: readings.size - readOk, alerts };
  db().prepare('INSERT INTO loan_watch_runs (at,watched,read_ok,read_failed,alerts) VALUES (?,?,?,?,?)').run(nowIso, result.watched, result.readOk, result.readFailed, result.alerts);
  db().prepare("DELETE FROM loan_watch_runs WHERE at < ?").run(new Date(input.nowMs - 7 * 86_400_000).toISOString());
  return result;
}

/* ---------------------------------------------------------------------- *
 * Trading wallet alerts (the trading pilot)
 *
 * One row per inbox and wallet. The wallet's activity is public on chain,
 * so a subscription proves the inbox, not the wallet. Nothing is sent until
 * the inbox is confirmed; every email can stop the alerts in one click.
 * ---------------------------------------------------------------------- */

export async function createTradingAlert(input: { email: string; wallet: string }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const wallet = input.wallet.toLowerCase();
  const token = randomBytes(32).toString('base64url');
  db().prepare(`INSERT INTO trading_alerts (id,email,wallet_address,verification_hash,created_at) VALUES (?,?,?,?,?)
    ON CONFLICT(email,wallet_address) DO UPDATE SET
      verification_hash=excluded.verification_hash,
      verified_at=NULL,
      unsubscribed_at=NULL,
      alerted_through_block=NULL,
      gaps_seen_through=NULL,
      created_at=excluded.created_at`).run(randomUUID(), email, wallet, hash(token), new Date().toISOString());
  const verifyUrl = `${appUrl()}/api/notifications/verify?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Confirm alerts for your trading wallet',
    idempotencyKey: `trading-verify-${hash(`${email}:${wallet}:${token}`).slice(0, 48)}`,
    html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Trading wallet alerts</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Confirm your alerts</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">Pokter checks this wallet about every ten minutes. You will hear when tokens leave it and nothing comes back in the same transaction, and if Pokter could not check a stretch of blocks.</p>${emailContext([['Wallet', `${input.wallet.slice(0, 6)}…${input.wallet.slice(-4)}`]])}<div>${emailButton(verifyUrl, 'Confirm alerts')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">This link only turns on alerts. It grants no wallet permission, and Pokter cannot move anything in this wallet. If you did not ask for this, ignore this email.</p>`, 'Confirm alerts for your trading wallet on Pokter.'),
  });
}

/**
 * The sweep's pass, after the trading scan: for each confirmed
 * subscription, email any transaction Pokter found where tokens left the
 * wallet and nothing came back, and any stretch of blocks it could not
 * check. Only what was found after the person subscribed; what was sent is
 * recorded after each send, so a failure is retried and nothing repeats.
 */
export async function notifyTradingAlerts(input: {
  flowsAfter: (wallet: string, block: number) => Array<{ txHash: string; block: number; at: string; verdict: string; note: string; sent: Array<{ symbol: string; amount: string; to: string }> }>;
  gapsAfter: (wallet: string, atIso: string) => Array<{ fromBlock: number; toBlock: number; at: string }>;
  revokeHelp: (wallet: string) => string | null;
  /** The wallet's coverage state (`coverage.ts`); only `current` counts as checked. */
  coverageOf: (wallet: string) => string;
  now?: number;
}): Promise<{ checked: number; sent: number }> {
  const now = input.now ?? Date.now();
  const rows = db().prepare(`SELECT id,email,wallet_address,created_at,alerted_through_block,gaps_seen_through,coverage_bad_since,coverage_warned_at FROM trading_alerts
    WHERE verified_at IS NOT NULL AND unsubscribed_at IS NULL`).all() as Array<{ id: string; email: string; wallet_address: string; created_at: string; alerted_through_block: number | null; gaps_seen_through: string | null; coverage_bad_since: string | null; coverage_warned_at: string | null }>;
  let sent = 0;
  for (const row of rows) {
    const unsubscribeUrl = `${appUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken(row.id))}`;
    const pageUrl = `${appUrl()}/trading?wallet=${row.wallet_address}`;
    const short = `${row.wallet_address.slice(0, 6)}…${row.wallet_address.slice(-4)}`;
    const footer = `<p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">Read by Pokter from BNB Chain. Email can be delayed; do not rely on it alone. Pokter never moves funds. <a href="${unsubscribeUrl}" style="color:#55534d;text-decoration:underline">Stop these alerts</a>.</p>`;

    const { alert: bad, nextThrough } = alertableFlows(input.flowsAfter(row.wallet_address, row.alerted_through_block ?? 0), { alertedThrough: row.alerted_through_block, subscribedAt: row.created_at });
    if (bad.length > 0) {
      const help = input.revokeHelp(row.wallet_address);
      const items = bad
        .map((f) => `<li style="margin:0 0 8px"><b>${escapeHtml(f.sent.map((x) => `${x.amount} ${x.symbol}`).join(' + '))}</b> out to ${escapeHtml(f.sent.map((x) => `${x.to.slice(0, 6)}…${x.to.slice(-4)}`).filter((v, i, all) => all.indexOf(v) === i).join(', '))}, nothing back · <a href="https://bscscan.com/tx/${escapeHtml(f.txHash)}" style="color:#55534d">${escapeHtml(f.txHash.slice(0, 12))}…</a></li>`)
        .join('');
      try {
        await sendEmail({
          to: row.email,
          subject: `Tokens left your trading wallet and did not come back (${short})`,
          idempotencyKey: `trading-${row.id}-${bad[bad.length - 1].txHash.slice(0, 20)}`,
          html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Trading wallet alert</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">${bad.length === 1 ? 'A transaction' : `${bad.length} transactions`} where nothing came back</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0 0 12px">Tokens left ${escapeHtml(short)} and nothing returned to it in the same transaction. If you did not make ${bad.length === 1 ? 'this' : 'these'}, revoke the agent's session now.${help ? ` ${escapeHtml(help)}` : ''}</p><ul style="padding-left:18px;font-size:13px;line-height:1.5;color:#292823;margin:0 0 16px">${items}</ul><div>${emailButton(pageUrl, 'See the wallet')}</div>${footer}`, 'Tokens left your trading wallet and did not come back.'),
        });
        sent += 1;
      } catch {
        continue; // Not recorded as sent: tried again next sweep.
      }
    }
    if (nextThrough !== null && nextThrough !== row.alerted_through_block) db().prepare('UPDATE trading_alerts SET alerted_through_block=? WHERE id=?').run(nextThrough, row.id);

    const gaps = input.gapsAfter(row.wallet_address, row.gaps_seen_through ?? row.created_at);
    if (gaps.length > 0) {
      try {
        await sendEmail({
          to: row.email,
          subject: `Pokter could not check part of your trading wallet's history (${short})`,
          idempotencyKey: `trading-${row.id}-gap-${gaps[gaps.length - 1].at}`,
          html: emailShell(`<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Trading wallet alert</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Some blocks went unchecked</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">Pokter was offline longer than the public node keeps history, so ${gaps.length === 1 ? 'one stretch' : `${gaps.length} stretches`} of this wallet's activity could not be checked. Look at its recent transactions on the explorer yourself; anything in ${gaps.length === 1 ? 'that stretch' : 'them'} would not have been alerted.</p>${emailContext(gaps.slice(0, 3).map((g) => ['Blocks', `${g.fromBlock.toLocaleString('en-US')}–${g.toBlock.toLocaleString('en-US')}`] as [string, string]))}<div>${emailButton(`https://bscscan.com/address/${row.wallet_address}`, 'Open the explorer')}</div>${footer}`, 'Pokter could not check part of your trading wallet’s history.'),
        });
        sent += 1;
        db().prepare('UPDATE trading_alerts SET gaps_seen_through=? WHERE id=?').run(gaps[gaps.length - 1].at, row.id);
      } catch {
        /* Tried again next sweep. */
      }
    }

    /* Silence is not safety: say when the checks themselves have stopped, and when they resume. */
    const notice = coverageNotice({ state: input.coverageOf(row.wallet_address), now, badSince: row.coverage_bad_since, warnedAt: row.coverage_warned_at });
    if (notice.send) {
      const stopped = notice.send === 'not-checked';
      try {
        await sendEmail({
          to: row.email,
          subject: stopped ? `Pokter cannot check your trading wallet right now (${short})` : `Pokter is checking your trading wallet again (${short})`,
          idempotencyKey: `trading-${row.id}-coverage-${notice.send}-${notice.warnedAt ?? row.coverage_warned_at}`,
          html: emailShell(
            stopped
              ? `<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Trading wallet alert</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Your wallet is not being checked</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0 0 16px">For the last ${Math.round((now - Date.parse(notice.badSince ?? new Date(now).toISOString())) / 60_000)} minutes Pokter has not been able to check ${escapeHtml(short)}, or has fallen behind it. Until you hear that checks have resumed, no email does not mean nothing happened. Look at the wallet on the explorer yourself.</p><div>${emailButton(`https://bscscan.com/address/${row.wallet_address}`, 'Open the explorer')}</div>${footer}`
              : `<p style="margin:0 0 10px;color:#2f6b3c;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Trading wallet</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Checks have resumed</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0 0 16px">Pokter is checking ${escapeHtml(short)} again. Anything it could not reach meanwhile is listed on the wallet's page as unchecked.</p><div>${emailButton(pageUrl, 'See the wallet')}</div>${footer}`,
            stopped ? 'Pokter cannot check your trading wallet right now.' : 'Pokter is checking your trading wallet again.',
          ),
        });
        sent += 1;
      } catch {
        continue; // Nothing recorded: the same notice is tried next sweep.
      }
    }
    if (notice.badSince !== row.coverage_bad_since || notice.warnedAt !== row.coverage_warned_at) {
      db().prepare('UPDATE trading_alerts SET coverage_bad_since=?, coverage_warned_at=? WHERE id=?').run(notice.badSince, notice.warnedAt, row.id);
    }
  }
  return { checked: rows.length, sent };
}

/** Confirmed alert subscriptions for a wallet, for the page to say alerts are on (a count, never the addresses). */
export function tradingAlertCount(wallet: string): number {
  return (db().prepare('SELECT COUNT(*) n FROM trading_alerts WHERE wallet_address=? AND verified_at IS NOT NULL AND unsubscribed_at IS NULL').get(wallet.toLowerCase()) as { n: number }).n;
}

/** What the page says about how reliable the alerts have been: the last run, and the past day's reads. */
export function loanWatchReliability(nowMs: number): { lastRunAt: string | null; runs: number; readOk: number; readFailed: number; alerts: number; watching: number } {
  const since = new Date(nowMs - 86_400_000).toISOString();
  const day = db().prepare('SELECT COUNT(*) runs, COALESCE(SUM(read_ok),0) ok, COALESCE(SUM(read_failed),0) failed, COALESCE(SUM(alerts),0) alerts, MAX(at) last FROM loan_watch_runs WHERE at >= ?').get(since) as { runs: number; ok: number; failed: number; alerts: number; last: string | null };
  const last = (db().prepare('SELECT MAX(at) last FROM loan_watch_runs').get() as { last: string | null }).last;
  const watching = (db().prepare('SELECT COUNT(DISTINCT wallet_address) n FROM loan_watches WHERE verified_at IS NOT NULL AND unsubscribed_at IS NULL').get() as { n: number }).n;
  return { lastRunAt: last, runs: day.runs, readOk: day.ok, readFailed: day.failed, alerts: day.alerts, watching };
}

/* ---------------------------------------------------------------------- *
 * Wallet-proven notification identity (§3)
 *
 * Kept beside the per-job subscriptions rather than replacing them. The
 * existing rows prove an inbox and an address nobody checked; these prove
 * both halves, and nothing promotes one to the other. See
 * `notifications/identity.ts` for why that line matters.
 * ---------------------------------------------------------------------- */

function identityDb() {
  const database = db();
  database.exec(`
    CREATE TABLE IF NOT EXISTS notification_identities (
      wallet_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      verification_hash TEXT NOT NULL,
      proven_at TEXT,
      verified_at TEXT,
      removed_at TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (wallet_address, chain_id)
    );
    CREATE TABLE IF NOT EXISTS notification_identity_challenges (
      id TEXT PRIMARY KEY,
      nonce_hash TEXT NOT NULL,
      message TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
  `);
  /*
   * The act the signature authorises, recorded so redemption can check it.
   * Challenges issued before this column existed are treated as claims,
   * which is what they were.
   */
  addColumn(database, 'notification_identity_challenges', "purpose TEXT NOT NULL DEFAULT 'claim'");
  addColumn(database, 'notification_identity_challenges', 'job_id TEXT');
  /*
   * A pending change remembers the address it is replacing and what the
   * buyer chose for work already running. Both are needed at verification
   * and not before: until the new inbox confirms, moving anything there
   * would send mail to an address nobody has proven.
   */
  addColumn(database, 'notification_identities', 'previous_email TEXT');
  addColumn(database, 'notification_identities', "on_verify TEXT NOT NULL DEFAULT 'move'");
  return database;
}

/**
 * A challenge for a wallet to sign, single-use, short-lived, and bound to
 * one act.
 *
 * The purpose is stored as well as signed, so redeeming a "send my updates
 * here" signature to stop them is refused rather than merely confusing.
 */
export function createIdentityChallenge(input: { wallet: Address; chainId: number; purpose: IdentityPurpose }) {
  const id = randomUUID();
  const nonce = randomBytes(24).toString('base64url');
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + IDENTITY_CHALLENGE_TTL_MS);
  const message = notificationIdentityMessage({
    challengeId: id, nonce, chainId: input.chainId, wallet: input.wallet,
    purpose: input.purpose, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(),
  });
  identityDb()
    .prepare(`INSERT INTO notification_identity_challenges
      (id,nonce_hash,message,wallet_address,chain_id,email,expires_at,purpose,job_id) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(
      id, hash(nonce), message, input.wallet.toLowerCase(), input.chainId,
      input.purpose.kind === 'claim' ? input.purpose.email : '',
      expiresAt.toISOString(), input.purpose.kind,
      input.purpose.kind === 'stop-job' ? input.purpose.jobId : null,
    );
  return { challengeId: id, message, expiresAt: expiresAt.toISOString() };
}

/**
 * The challenge to check a signature against, consumed on read.
 *
 * Single use and expiry-checked here rather than at the call site, so a
 * replayed signature cannot bind an inbox a second time.
 */
export function consumeIdentityChallenge(id: string, expected: IdentityPurposeKind): {
  wallet: string; chainId: number; email: string; jobId: string | null; message: string;
} | null {
  const database = identityDb();
  const row = database
    .prepare('SELECT * FROM notification_identity_challenges WHERE id = ? AND used_at IS NULL')
    .get(id) as
    | { wallet_address: string; chain_id: number; email: string; job_id: string | null; purpose: string; message: string; expires_at: string }
    | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  /*
   * Consumed either way. A challenge offered for the wrong act is spent, so
   * a caller cannot probe for one that happens to fit.
   */
  database.prepare('UPDATE notification_identity_challenges SET used_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  if (row.purpose !== expected) return null;
  return {
    wallet: row.wallet_address, chainId: row.chain_id, email: row.email,
    jobId: row.job_id, message: row.message,
  };
}

export function readIdentity(wallet: string, chainId: number): NotificationIdentity | null {
  const row = identityDb()
    .prepare('SELECT * FROM notification_identities WHERE wallet_address = ? AND chain_id = ?')
    .get(wallet.toLowerCase(), chainId) as
    | {
      wallet_address: string; chain_id: number; email: string; proven_at: string | null;
      verified_at: string | null; removed_at: string | null; previous_email: string | null;
    }
    | undefined;
  if (!row) return null;
  return {
    wallet: row.wallet_address, chainId: row.chain_id, email: row.email,
    provenAt: row.proven_at, verifiedAt: row.verified_at, removedAt: row.removed_at,
    previousEmail: row.previous_email,
  };
}

/**
 * The jobs this wallet's address is currently sending updates about.
 *
 * Read from the address rather than the wallet column, because the address
 * is what decides where mail goes — including rows created before this
 * wallet ever proved anything, by typing the same address into a job page.
 * Settings has to show those too, or it would offer to stop mail it claims
 * does not exist.
 */
export function runningJobUpdates(wallet: string, chainId: number): { jobId: string; includeAnswer: boolean }[] {
  const email = subscriptionAddress(readIdentity(wallet, chainId));
  if (!email) return [];
  return (db()
    .prepare(`SELECT job_id,include_answer FROM notification_subscriptions
      WHERE email=? AND chain_id=? AND verified_at IS NOT NULL AND unsubscribed_at IS NULL
      ORDER BY CAST(job_id AS INTEGER) DESC`)
    .all(email, chainId) as { job_id: string; include_answer: number }[])
    .map((row) => ({ jobId: row.job_id, includeAnswer: row.include_answer === 1 }));
}

/**
 * Record a wallet's proof and send the inbox its link.
 *
 * The signature is checked by the caller, which owns the EOA and
 * contract-wallet distinction. Idempotent: claiming the same address twice
 * replaces the pending link rather than stacking two live ones, and a
 * verified row keeps its verification until a new address is confirmed —
 * so changing an email never silently stops updates mid-job.
 */
export function recordIdentityProof(input: {
  wallet: string; chainId: number; email: string; token: string;
  /** What to do with running jobs once the new inbox confirms. */
  onVerify?: AddressChangeChoice;
}): void {
  const now = new Date().toISOString();
  const existing = readIdentity(input.wallet, input.chainId);
  const keepVerified = existing && existing.email === input.email && existing.verifiedAt && !existing.removedAt;
  /*
   * The address being replaced, kept only while a replacement is pending.
   * A re-confirmation of the same address replaces nothing, so it records
   * nothing to move.
   */
  const previous = existing && existing.verifiedAt && !existing.removedAt && existing.email !== input.email
    ? existing.email
    : null;
  identityDb()
    .prepare(`INSERT INTO notification_identities
      (wallet_address,chain_id,email,verification_hash,proven_at,verified_at,removed_at,created_at,previous_email,on_verify)
      VALUES (?,?,?,?,?,?,NULL,?,?,?)
      ON CONFLICT(wallet_address,chain_id) DO UPDATE SET
        email=excluded.email, verification_hash=excluded.verification_hash,
        proven_at=excluded.proven_at, verified_at=excluded.verified_at, removed_at=NULL,
        previous_email=excluded.previous_email, on_verify=excluded.on_verify`)
    .run(
      input.wallet.toLowerCase(), input.chainId, input.email, hash(input.token), now,
      keepVerified ? existing!.verifiedAt : null, now, previous, input.onVerify ?? 'move',
    );
}

/**
 * Claim an address: record the wallet's proof, then mail the inbox its
 * link.
 *
 * Reports whether the mail went rather than throwing, because the proof is
 * already recorded and a buyer should be told "we could not send it, try
 * again" rather than see a failure that hides a row they now have.
 */
export async function claimNotificationEmail(input: {
  wallet: string; chainId: number; email: string; onVerify?: AddressChangeChoice;
}): Promise<{ emailed: boolean; reason?: string }> {
  const token = randomUUID();
  recordIdentityProof({ ...input, token });
  const verifyUrl = `${appUrl()}/api/notifications/verify?token=${encodeURIComponent(token)}`;
  const network = input.chainId === 97 ? 'BNB Smart Chain Testnet' : chainLabel(input.chainId);
  try {
    await sendEmail({
      to: input.email,
      subject: 'Confirm this email for your Pokter job updates',
      idempotencyKey: `identity-${hash(`${input.email}:${input.chainId}:${token}`).slice(0, 48)}`,
      html: emailShell(
        `<p style="margin:0 0 10px;color:#9a7414;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Email verification</p><h1 style="font-size:25px;line-height:1.2;letter-spacing:-.4px;margin:0 0 12px">Confirm this address</h1><p style="font-size:14px;line-height:1.65;color:#55534d;margin:0">A Pokter wallet asked to send its job updates here. Confirming lets it do that in one click per job \u2014 it does not subscribe you to anything on its own, and nothing is sent here until you confirm.</p>${emailContext([['Wallet', input.wallet], ['Network', network]])}<div>${emailButton(verifyUrl, 'Confirm this address')}</div><p style="font-size:11px;line-height:1.6;color:#77756d;margin:22px 0 0">This link only enables notifications. It cannot sign transactions or access any wallet. If you did not ask for this, ignore this email and nothing will be sent here.</p>`,
        'Confirm an email address for Pokter job updates.',
      ),
    });
    return { emailed: true };
  } catch (error) {
    return { emailed: false, reason: (error as Error).message };
  }
}

/**
 * Confirm the inbox, from the emailed link, and settle what the buyer chose
 * for work already running.
 *
 * The choice is applied here and nowhere earlier. Moving a live escrow's
 * updates to an address at claim time would send them somewhere nobody had
 * proven; this is the first moment the new inbox has said anything.
 */
export function verifyIdentity(token: string): { wallet: string; chainId: number; moved: number; stopped: number } | null {
  const database = identityDb();
  const row = database
    .prepare(`SELECT wallet_address, chain_id, email, previous_email, on_verify
      FROM notification_identities WHERE verification_hash = ? AND removed_at IS NULL`)
    .get(hash(token)) as
    | { wallet_address: string; chain_id: number; email: string; previous_email: string | null; on_verify: string }
    | undefined;
  if (!row) return null;
  const now = new Date().toISOString();
  database
    .prepare('UPDATE notification_identities SET verified_at = COALESCE(verified_at, ?) WHERE wallet_address = ? AND chain_id = ?')
    .run(now, row.wallet_address, row.chain_id);

  let moved = 0;
  let stopped = 0;
  if (row.previous_email && row.previous_email !== row.email) {
    const running = db()
      .prepare(`SELECT job_id,include_answer FROM notification_subscriptions
        WHERE email=? AND chain_id=? AND verified_at IS NOT NULL AND unsubscribed_at IS NULL`)
      .all(row.previous_email, row.chain_id) as { job_id: string; include_answer: number }[];
    const plan = addressChangePlan({
      running: running.map((job) => ({ chainId: row.chain_id, jobId: job.job_id })),
      choice: row.on_verify === 'stop' ? 'stop' : 'move',
    });
    for (const job of plan.move) {
      const previous = running.find((candidate) => candidate.job_id === job.jobId);
      /*
       * The new row is confirmed on creation: the inbox proved itself a
       * moment ago, by the link being clicked. The old row is retired
       * rather than edited, so the move leaves a record of where the mail
       * used to go.
       */
      db().prepare(`INSERT INTO notification_subscriptions
        (id,email,wallet_address,chain_id,job_id,verification_hash,verified_at,created_at,include_answer)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(email,chain_id,job_id) DO UPDATE SET
          verified_at=COALESCE(notification_subscriptions.verified_at, excluded.verified_at),
          include_answer=excluded.include_answer, unsubscribed_at=NULL`).run(
        randomUUID(), row.email, row.wallet_address, row.chain_id, job.jobId,
        hash(randomBytes(32).toString('base64url')), now, now, previous?.include_answer ?? 0,
      );
      moved += 1;
    }
    stopped = plan.stop.length;
    /*
     * The old rows are retired either way. A moved job already has its new
     * row above, so leaving the old one live would send both.
     */
    db().prepare(`UPDATE notification_subscriptions SET unsubscribed_at=?
      WHERE email=? AND chain_id=? AND unsubscribed_at IS NULL`).run(now, row.previous_email, row.chain_id);
    database
      .prepare('UPDATE notification_identities SET previous_email=NULL WHERE wallet_address=? AND chain_id=?')
      .run(row.wallet_address, row.chain_id);
  }
  return { wallet: row.wallet_address, chainId: row.chain_id, moved, stopped };
}

/* ---------------------------------------------------------------------- *
 * Cross-device inbox read state (§6)
 * ---------------------------------------------------------------------- */

function readStateDb() {
  const database = db();
  database.exec(`
    CREATE TABLE IF NOT EXISTS notification_read_tokens (
      token_hash TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notification_read_tokens_wallet
      ON notification_read_tokens (wallet_address, chain_id);
    CREATE TABLE IF NOT EXISTS notification_read_marks (
      wallet_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      seen_through TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (wallet_address, chain_id)
    );
  `);
  return database;
}

/**
 * A token for one device, after the wallet signed for it.
 *
 * Stored as a hash, like every other token here: a database that leaks
 * should not hand out working credentials. It authorises moving this
 * wallet's read marker on this chain and nothing else, which is what keeps
 * a leaked one cheap.
 */
export function issueReadToken(input: { wallet: string; chainId: number }): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + READ_TOKEN_TTL_MS).toISOString();
  readStateDb()
    .prepare(`INSERT INTO notification_read_tokens (token_hash,wallet_address,chain_id,expires_at,created_at)
      VALUES (?,?,?,?,?)`)
    .run(hash(token), input.wallet.toLowerCase(), input.chainId, expiresAt, new Date().toISOString());
  return { token, expiresAt };
}

/** Who a token speaks for, or null when it is unknown or expired. */
export function walletForReadToken(token: string): { wallet: string; chainId: number } | null {
  if (!token) return null;
  const row = readStateDb()
    .prepare('SELECT wallet_address, chain_id, expires_at FROM notification_read_tokens WHERE token_hash = ?')
    .get(hash(token)) as { wallet_address: string; chain_id: number; expires_at: string } | undefined;
  if (!row || !readTokenUsable({ expiresAt: row.expires_at })) return null;
  return { wallet: row.wallet_address, chainId: row.chain_id };
}

/** Drop every token for a wallet, when it asks to stop syncing. */
export function revokeReadTokens(wallet: string, chainId: number): number {
  return Number(
    readStateDb()
      .prepare('DELETE FROM notification_read_tokens WHERE wallet_address=? AND chain_id=?')
      .run(wallet.toLowerCase(), chainId).changes,
  );
}

export function readWatermark(wallet: string, chainId: number): Watermark | null {
  const row = readStateDb()
    .prepare('SELECT seen_through FROM notification_read_marks WHERE wallet_address=? AND chain_id=?')
    .get(wallet.toLowerCase(), chainId) as { seen_through: string } | undefined;
  return row ? { seenThrough: row.seen_through } : null;
}

/**
 * Move the marker forward, never back.
 *
 * The comparison happens here in JS rather than in SQL so the rule that
 * runs is the one under test: a device that was offline holds a stale
 * value, and letting it win would mark settled work unread again on every
 * sync.
 */
export function advanceWatermark(input: { wallet: string; chainId: number; seenThrough: string }): Watermark | null {
  const at = Date.parse(input.seenThrough);
  if (!Number.isFinite(at)) return readWatermark(input.wallet, input.chainId);
  const merged = mergeWatermark(
    readWatermark(input.wallet, input.chainId),
    { seenThrough: new Date(at).toISOString() },
  );
  if (!merged) return null;
  readStateDb()
    .prepare(`INSERT INTO notification_read_marks (wallet_address,chain_id,seen_through,updated_at)
      VALUES (?,?,?,?)
      ON CONFLICT(wallet_address,chain_id) DO UPDATE SET
        seen_through=excluded.seen_through, updated_at=excluded.updated_at`)
    .run(input.wallet.toLowerCase(), input.chainId, merged.seenThrough, new Date().toISOString());
  return merged;
}

/* ---------------------------------------------------------------------- *
 * Per-job updates for a wallet that already proved an address
 * ---------------------------------------------------------------------- */

/**
 * The subscription this wallet's proven address has for one job.
 *
 * Keyed through the identity rather than by wallet column, because the
 * subscription table's unique key is `(email, chain, job)` and the email is
 * what decides where mail goes. A wallet with no identity has nothing to
 * look up and gets null, which `jobUpdateOffer` reads as "ask for an
 * address".
 */
export function readJobUpdateRow(input: { wallet: string; chainId: number; jobId: string }): JobUpdateRow | null {
  const email = subscriptionAddress(readIdentity(input.wallet, input.chainId));
  if (!email) return null;
  const row = db()
    .prepare(`SELECT email,verified_at,unsubscribed_at,include_answer FROM notification_subscriptions
      WHERE email=? AND chain_id=? AND job_id=?`)
    .get(email, input.chainId, input.jobId) as
    | { email: string; verified_at: string | null; unsubscribed_at: string | null; include_answer: number }
    | undefined;
  if (!row) return null;
  return {
    email: row.email, verifiedAt: row.verified_at,
    unsubscribedAt: row.unsubscribed_at, includeAnswer: row.include_answer === 1,
  };
}

/**
 * Turn on updates for one job using the address the wallet already proved.
 *
 * No email is sent and no link is waited for: `subscriptionPreVerified`
 * holds the one rule that makes that safe — the address must be the
 * identity's own, so the confirmation this skips is one the same inbox has
 * already given. Anything else returns `not-proven` and the caller falls
 * back to the form.
 *
 * The caller is responsible for checking the wallet is the job's on-chain
 * client. That check is what keeps this from being a way to point mail at
 * somebody else's job — though even without it the only reachable
 * outcome is a wallet's own inbox hearing about a wallet's own job.
 */
export function subscribeFromIdentity(input: {
  wallet: string; chainId: number; jobId: string; includeAnswer?: boolean;
}): { ok: true; email: string } | { ok: false; reason: 'not-proven' } {
  const identity = readIdentity(input.wallet, input.chainId);
  if (!identity || !subscriptionPreVerified(identity, identity.email)) return { ok: false, reason: 'not-proven' };
  const now = new Date().toISOString();
  /*
   * `verification_hash` is a dead token here: there is no link to click, so
   * nothing can redeem it. A random value keeps the column non-null without
   * minting something that would verify anything.
   */
  db().prepare(`INSERT INTO notification_subscriptions
    (id,email,wallet_address,chain_id,job_id,verification_hash,verified_at,created_at,include_answer)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(email,chain_id,job_id) DO UPDATE SET
      wallet_address=excluded.wallet_address,
      include_answer=excluded.include_answer,
      verified_at=COALESCE(notification_subscriptions.verified_at, excluded.verified_at),
      unsubscribed_at=NULL`).run(
    randomUUID(), identity.email, input.wallet.toLowerCase(), input.chainId, input.jobId,
    hash(randomBytes(32).toString('base64url')), now, now, input.includeAnswer ? 1 : 0,
  );
  return { ok: true, email: identity.email };
}

/**
 * Stop updates for one job.
 *
 * Unsubscribed rather than deleted, so `jobUpdateOffer` can say "on again?"
 * instead of forgetting it ever happened, and so a second stop is a no-op.
 * The caller proves the wallet first: see `stopNeedsWalletProof` for why
 * this direction costs a signature when turning updates on does not.
 */
export function stopJobUpdates(input: { wallet: string; chainId: number; jobId: string }): boolean {
  const email = subscriptionAddress(readIdentity(input.wallet, input.chainId));
  if (!email) return false;
  const result = db()
    .prepare(`UPDATE notification_subscriptions SET unsubscribed_at=?
      WHERE email=? AND chain_id=? AND job_id=? AND unsubscribed_at IS NULL`)
    .run(new Date().toISOString(), email, input.chainId, input.jobId);
  return result.changes > 0;
}

/**
 * Remove the association, at the buyer's request, and stop what it was
 * sending.
 *
 * The per-job rows go with it. The wallet signs text saying so, and
 * without this they would keep arriving from an address the buyer was just
 * told had been removed — so the signed words would be false, which is
 * worse than the leftover mail.
 *
 * Scoped to this chain's rows only, because the identity is: the same
 * address proven on the other escrow keeps its own subscriptions.
 */
export function removeIdentity(wallet: string, chainId: number): { stoppedJobs: number } {
  const now = new Date().toISOString();
  const email = subscriptionAddress(readIdentity(wallet, chainId));
  const stopped = email
    ? db()
      .prepare(`UPDATE notification_subscriptions SET unsubscribed_at=?
        WHERE email=? AND chain_id=? AND unsubscribed_at IS NULL`)
      .run(now, email, chainId).changes
    : 0;
  identityDb()
    .prepare('UPDATE notification_identities SET removed_at = ? WHERE wallet_address = ? AND chain_id = ?')
    .run(now, wallet.toLowerCase(), chainId);
  return { stoppedJobs: Number(stopped) };
}

/**
 * Email sign-ups by kind, as counts only: for the operator, never shown
 * publicly. An address counts once it is verified and until it
 * unsubscribes; `new` is by when the row was created, verified or not.
 * Emails cannot be told apart as team or outside, so none are excluded.
 */
export const EMAIL_SIGNUP_KINDS = {
  job_updates: 'notification_subscriptions',
  builder_emails: 'builder_notification_subscriptions',
  agent_follows: 'agent_follows',
  set_and_earn_reminders: 'campaign_reminders',
  loan_watch: 'loan_watches',
  trading_alerts: 'trading_alerts',
} as const;

export type EmailSignupCounts = { active: number; verifiedEmails: number; requested7d: number; requested30d: number };

export function emailSignupCounts(now = Date.now()): { byKind: Record<keyof typeof EMAIL_SIGNUP_KINDS, EmailSignupCounts>; distinctVerifiedEmails: number } {
  const d7 = new Date(now - 7 * 86_400_000).toISOString();
  const d30 = new Date(now - 30 * 86_400_000).toISOString();
  const byKind = {} as Record<keyof typeof EMAIL_SIGNUP_KINDS, EmailSignupCounts>;
  for (const [kind, table] of Object.entries(EMAIL_SIGNUP_KINDS) as Array<[keyof typeof EMAIL_SIGNUP_KINDS, string]>) {
    const row = db()
      .prepare(
        `SELECT COALESCE(SUM(verified_at IS NOT NULL AND unsubscribed_at IS NULL), 0) AS active,
                COUNT(DISTINCT CASE WHEN verified_at IS NOT NULL THEN email END) AS verifiedEmails,
                COALESCE(SUM(created_at >= ?), 0) AS requested7d,
                COALESCE(SUM(created_at >= ?), 0) AS requested30d
         FROM ${table}`,
      )
      .get(d7, d30) as EmailSignupCounts;
    byKind[kind] = { active: Number(row.active), verifiedEmails: Number(row.verifiedEmails), requested7d: Number(row.requested7d), requested30d: Number(row.requested30d) };
  }
  const union = Object.values(EMAIL_SIGNUP_KINDS).map((table) => `SELECT email FROM ${table} WHERE verified_at IS NOT NULL`).join(' UNION ');
  const distinct = db().prepare(`SELECT COUNT(*) AS n FROM (${union})`).get() as { n: number };
  return { byKind, distinctVerifiedEmails: Number(distinct.n) };
}

