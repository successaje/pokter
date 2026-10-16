/**
 * Every email Pokter sends has to name a consent that permits it.
 *
 * Checked here rather than at runtime, for the same reason the rate limits
 * are: the mistake this prevents is made while writing the code, and a
 * guard inside the send path can only fail after somebody has already
 * shipped a broadcast. A missing consent is a defect in the source, so the
 * source is what gets read.
 *
 * What it is actually defending against: a marketplace with one proven
 * address per wallet is a single query away from a mailing list. The only
 * thing between the two is that no stored row can be read as agreement to
 * anything but its own subject — and that nobody adds a seventh sender
 * that loops over addresses.
 */
import { readFileSync } from 'node:fs';

import { CONSENT_NOT_REQUIRED, sendPermitted, type MailClass } from '../src/lib/notifications/preferences.js';

const SOURCE = 'src/lib/notifications/server.ts';
const source = readFileSync(SOURCE, 'utf8');

/**
 * Every function allowed to send, and the consent each one sends under.
 *
 * `table` is the consent's own store. A sender that is not asking for
 * consent must select its recipients from there, so the address it sends
 * to is the address that agreed.
 */
const SENDERS: { fn: string; mailClass: MailClass; table?: string }[] = [
  { fn: 'createSubscription', mailClass: 'confirmation' },
  { fn: 'createBuilderSubscription', mailClass: 'confirmation' },
  { fn: 'createAgentFollow', mailClass: 'confirmation' },
  { fn: 'notifyJobEvent', mailClass: 'job', table: 'notification_subscriptions' },
  { fn: 'notifyBuilderJobEvent', mailClass: 'builder', table: 'builder_notification_subscriptions' },
  { fn: 'notifyFollowers', mailClass: 'agent-watch', table: 'agent_follows' },
];

/**
 * The source of one top-level function, up to the next one.
 *
 * Sliced on declarations rather than counted by braces: these signatures
 * carry object parameters and object return types, so the first `{` after
 * the name is not the body and brace counting closes early — which it
 * did, silently reporting every sender as sending nothing.
 */
const DECLARATION = /^(?:export )?(?:async )?function |^\/\* -+ \*\//m;

function bodyOf(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${SOURCE} no longer defines ${name}`);
  const after = source.slice(start);
  const next = after.slice(1).search(DECLARATION);
  return next < 0 ? after : after.slice(0, next + 1);
}

/* 1. Nothing sends except the senders named above. */
const callers = new Set<string>();
for (const sender of SENDERS) {
  if (bodyOf(sender.fn).includes('sendEmail(')) callers.add(sender.fn);
}
const totalSends = source.split('sendEmail({').length - 1;
const accountedSends = SENDERS.reduce(
  (total, sender) => total + (bodyOf(sender.fn).split('sendEmail({').length - 1),
  0,
);
if (totalSends !== accountedSends) {
  throw new Error(
    `${totalSends} email sends exist but only ${accountedSends} are inside a declared sender. ` +
    'Add the new sender to SENDERS in this script, with the consent it sends under, ' +
    'or route it through one that already has one.',
  );
}
if (callers.size !== SENDERS.length) {
  const idle = SENDERS.filter((s) => !callers.has(s.fn)).map((s) => s.fn);
  throw new Error(`These declared senders no longer send anything: ${idle.join(', ')}. Remove them or fix the mapping.`);
}

/* 2. A consented sender takes its recipients from its own consent store. */
for (const sender of SENDERS) {
  if (!sender.table) continue;
  const body = bodyOf(sender.fn);
  if (!body.includes(sender.table)) {
    throw new Error(`${sender.fn} sends ${sender.mailClass} mail without reading ${sender.table}`);
  }
  /*
   * Both halves, every time. An unverified row proves no inbox, and an
   * unsubscribed one proves the opposite of consent.
   */
  for (const clause of ['verified_at IS NOT NULL', 'unsubscribed_at IS NULL']) {
    if (!body.includes(clause)) {
      throw new Error(`${sender.fn} selects recipients without "${clause}", so it can mail an address that never agreed`);
    }
  }
  if (!body.includes('unsubscribeToken(')) {
    throw new Error(`${sender.fn} sends ${sender.mailClass} mail with no way to stop it`);
  }
}

/* 3. The confirmation senders are the only ones that need no consent. */
for (const sender of SENDERS) {
  const needsNone = CONSENT_NOT_REQUIRED.includes(sender.mailClass);
  if (needsNone !== !sender.table) {
    throw new Error(`${sender.fn} is declared ${sender.mailClass} but ${sender.table ? 'reads' : 'does not read'} a consent store`);
  }
}

/* 4. The model itself: a consent covers its own subject and nothing else. */
const held = [{ mailClass: 'job' as MailClass, subject: '97:1502' }];
if (!sendPermitted(held, { mailClass: 'job', subject: '97:1502' })) {
  throw new Error('A consent did not permit its own subject');
}
for (const send of [
  { mailClass: 'job' as MailClass, subject: '97:1503' },
  { mailClass: 'agent-watch' as MailClass, subject: '97:1502' },
  { mailClass: 'builder' as MailClass, subject: '97:1502' },
]) {
  if (sendPermitted(held, send)) {
    throw new Error(`One job's consent permitted ${send.mailClass} mail about ${send.subject}`);
  }
}

console.log(`Notification consent checks passed (${SENDERS.length} senders, ${totalSends} sends).`);
