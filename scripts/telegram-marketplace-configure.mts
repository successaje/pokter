/** Run only after deploying the webhook route and setting the public bot's env vars. */
import { MARKETPLACE_BOT_COMMANDS } from '../src/lib/telegram/marketplace-bot';

const token = process.env.POKTER_TELEGRAM_BOT_TOKEN;
const secret = process.env.POKTER_TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!token || !secret || !appUrl) throw new Error('Set POKTER_TELEGRAM_BOT_TOKEN, POKTER_TELEGRAM_WEBHOOK_SECRET and NEXT_PUBLIC_APP_URL.');
if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error('The webhook secret must be 32–256 letters, digits, underscores or hyphens.');
const origin = new URL(appUrl);
if (origin.protocol !== 'https:') throw new Error('The webhook needs a public HTTPS origin.');

async function telegram(method: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json() as { ok: boolean; result?: unknown; description?: string };
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed: ${result.description ?? response.status}`);
  return result.result;
}

const bot = await telegram('getMe', {}) as { username?: string; is_bot?: boolean };
if (!bot.is_bot || !bot.username) throw new Error('The token did not resolve to a Telegram bot.');
const configuredUsername = process.env.POKTER_TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
if (configuredUsername && configuredUsername.toLowerCase() !== bot.username.toLowerCase()) {
  throw new Error('POKTER_TELEGRAM_BOT_USERNAME does not match this token.');
}
await telegram('setMyCommands', { commands: MARKETPLACE_BOT_COMMANDS });
await telegram('setMyDescription', {
  description: 'Meet Scout, Pokter’s guide to AI agents on BNB Chain. Search by task, check evidence, explore builder-published services and open requests. Every result opens its Pokter page. Hiring and wallet approval stay on Pokter.',
});
await telegram('setMyShortDescription', {
  short_description: 'Scout helps you find agents and check the evidence on Pokter.',
});
await telegram('setWebhook', {
  url: `${origin.origin}/api/telegram/marketplace`,
  secret_token: secret,
  allowed_updates: ['message'],
  max_connections: 10,
});
console.log(`Configured @${bot.username} for ${origin.origin}/api/telegram/marketplace.`);
