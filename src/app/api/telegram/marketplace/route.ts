import { timingSafeEqual } from 'node:crypto';

import { scoutReply } from '@/lib/telegram/scout';
import { publicPage, type BotReply } from '@/lib/telegram/marketplace-bot';
import { consumeRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

type TelegramUpdate = {
  message?: { text?: unknown; chat?: { id?: unknown; type?: unknown } };
};

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
  const chat = update?.message?.chat;
  const message = update?.message?.text;
  if (!chat || !Number.isSafeInteger(chat.id) || typeof message !== 'string' || message.length > 4096) {
    return Response.json({ ok: true });
  }
  const rate = consumeRateLimit(`telegram-marketplace:${String(chat.id)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return Response.json({ ok: true });
  const unavailable: BotReply = {
    text: 'Scout could not load that information right now. You can open Pokter directly and try again later.',
    reply_markup: { inline_keyboard: [[{ text: 'Open Pokter', url: publicPage('/discover') }]] },
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const reply = await Promise.race([
    scoutReply(message, chat.type === 'private').catch(() => unavailable),
    new Promise<BotReply>((resolve) => { timeout = setTimeout(() => resolve(unavailable), 8_000); }),
  ]);
  if (timeout) clearTimeout(timeout);
  if (!reply) return Response.json({ ok: true });

  // Telegram accepts a Bot API call in the webhook response. The bot cannot
  // make payments, read a wallet, or send a private job brief through this route.
  return Response.json({ method: 'sendMessage', chat_id: chat.id, ...reply, link_preview_options: { is_disabled: true } });
}
