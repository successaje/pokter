import { timingSafeEqual } from 'node:crypto';

import { scoutReply } from '@/lib/telegram/scout';
import { publicPage, type BotReply } from '@/lib/telegram/marketplace-bot';
import { consumeRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

type TelegramUpdate = {
  message?: { text?: unknown; chat?: { id?: unknown; type?: unknown } };
  callback_query?: {
    id?: unknown;
    data?: unknown;
    from?: { id?: unknown };
    message?: { chat?: { id?: unknown; type?: unknown } };
  };
};

async function answerCallbackQuery(id: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${process.env.POKTER_TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch { /* The confirmation message can still be delivered by the webhook response. */ }
}

function validSecret(received: string | null): boolean {
  const expected = process.env.POKTER_TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.POKTER_TELEGRAM_BOT_TOKEN || !validSecret(request.headers.get('x-telegram-bot-api-secret-token'))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (Number(request.headers.get('content-length') ?? '0') > 16_384) return Response.json({ error: 'Update too large' }, { status: 413 });
  const body = await request.text();
  if (body.length > 16_384) return Response.json({ error: 'Update too large' }, { status: 413 });
  let update: TelegramUpdate;
  try {
    update = JSON.parse(body) as TelegramUpdate;
  } catch {
    return Response.json({ error: 'Invalid update' }, { status: 400 });
  }
  const callback = update?.callback_query;
  const chat = callback ? callback.message?.chat : update?.message?.chat;
  const message = callback?.data === 'scout:enable_ai' ? 'Enable AI chat' : update?.message?.text;
  if (!chat || !Number.isSafeInteger(chat.id) || typeof message !== 'string' || message.length > 4096) {
    return Response.json({ ok: true });
  }
  if (callback && (callback.data !== 'scout:enable_ai' || typeof callback.id !== 'string'
    || !Number.isSafeInteger(callback.from?.id) || callback.from?.id !== chat.id || chat.type !== 'private')) {
    return Response.json({ ok: true });
  }
  const rate = consumeRateLimit(`telegram-marketplace:${String(chat.id)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return Response.json({ ok: true });
  if (callback) await answerCallbackQuery(callback.id as string);
  const unavailable: BotReply = {
    text: 'Scout could not load that information right now. You can open Pokter directly and try again later.',
    reply_markup: { inline_keyboard: [[{ text: 'Open Pokter', url: publicPage('/discover') }]] },
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const reply = await Promise.race([
    scoutReply(message, chat.type === 'private', chat.id as number).catch(() => unavailable),
    new Promise<BotReply>((resolve) => { timeout = setTimeout(() => resolve(unavailable), 8_000); }),
  ]);
  if (timeout) clearTimeout(timeout);
  if (!reply) return Response.json({ ok: true });

  // Telegram accepts a Bot API call in the webhook response. The bot cannot
  // make payments, read a wallet, or send a private job brief through this route.
  return Response.json({ method: 'sendMessage', chat_id: chat.id, ...reply, link_preview_options: { is_disabled: true } });
}
