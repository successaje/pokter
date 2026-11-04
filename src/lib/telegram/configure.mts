/** Set the bot profile before deploy, or register its webhook after the route is live. */
import { readFile } from 'node:fs/promises';
import { MARKETPLACE_BOT_COMMANDS } from './marketplace-bot';

const profileOnly = process.argv.includes('--profile-only');
const statusOnly = process.argv.includes('--status');
const fromStdin = process.argv.includes('--token-stdin');
const photoPath = process.argv.includes('--photo-path') ? process.argv[process.argv.indexOf('--photo-path') + 1] : null;
const token = fromStdin
  ? (await new Promise<string>((resolve) => {
      let value = '';
      process.stdin.setEncoding('utf8');
      const done = (answer: string) => {
        process.stdin.off('data', onData);
        process.stdin.off('end', onEnd);
        process.stdin.pause();
        resolve(answer);
      };
      const onData = (chunk: string) => { value += chunk; if (value.includes('\n')) done(value.split('\n')[0].trim()); };
      const onEnd = () => done(value.trim());
      process.stdin.on('data', onData);
      process.stdin.on('end', onEnd);
    }))
  : process.env.POKTER_TELEGRAM_BOT_TOKEN;
const secret = process.env.POKTER_TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!token) throw new Error('Set POKTER_TELEGRAM_BOT_TOKEN or use --token-stdin.');
if (!profileOnly && !statusOnly && (!secret || !appUrl)) throw new Error('Set POKTER_TELEGRAM_WEBHOOK_SECRET and NEXT_PUBLIC_APP_URL.');
if (!profileOnly && !statusOnly && !/^[A-Za-z0-9_-]{32,256}$/.test(secret!)) throw new Error('The webhook secret must be 32–256 letters, digits, underscores or hyphens.');
const origin = appUrl ? new URL(appUrl) : null;
if (!profileOnly && !statusOnly && origin?.protocol !== 'https:') throw new Error('The webhook needs a public HTTPS origin.');

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
if (statusOnly) {
  const [commands, description, about, webhook] = await Promise.all([
    telegram('getMyCommands', {}), telegram('getMyDescription', {}),
    telegram('getMyShortDescription', {}), telegram('getWebhookInfo', {}),
  ]) as [{ command: string }[], { description: string }, { short_description: string }, { url: string; pending_update_count: number }];
  console.log(JSON.stringify({ username: bot.username, commands: commands.map((c) => c.command), description: description.description, about: about.short_description, webhookUrl: webhook.url, pendingUpdates: webhook.pending_update_count }, null, 2));
} else {
await telegram('setMyCommands', { commands: MARKETPLACE_BOT_COMMANDS });
await telegram('setMyDescription', {
  description: 'Meet Scout, Pokter’s guide to AI agents on BNB Chain. Search by task, check evidence, explore builder-published services and open requests. Every result opens its Pokter page. Hiring and wallet approval stay on Pokter.',
});
await telegram('setMyShortDescription', {
  short_description: 'Scout helps you find agents and check the evidence on Pokter.',
});
if (photoPath) {
  if (!/\.jpe?g$/i.test(photoPath)) throw new Error('Telegram requires a JPEG profile photo.');
  const form = new FormData();
  form.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  form.set('avatar', new Blob([new Uint8Array(await readFile(photoPath))], { type: 'image/jpeg' }), 'scout.jpg');
  const response = await fetch(`https://api.telegram.org/bot${token}/setMyProfilePhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) });
  const result = await response.json() as { ok: boolean; description?: string };
  if (!response.ok || !result.ok) throw new Error(`Telegram setMyProfilePhoto failed: ${result.description ?? response.status}`);
}
if (!profileOnly) {
  await telegram('setWebhook', {
    url: `${origin!.origin}/api/telegram/marketplace`,
    secret_token: secret,
    allowed_updates: ['message'],
    max_connections: 10,
  });
}
console.log(profileOnly ? `Configured @${bot.username}'s profile and commands.` : `Configured @${bot.username} for ${origin!.origin}/api/telegram/marketplace.`);
}
