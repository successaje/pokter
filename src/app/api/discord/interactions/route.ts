import { after } from 'next/server';

import { consumeRateLimit } from '@/lib/security/rate-limit';
import { verifyDiscordRequest } from '@/lib/discord/verify';
import { discordHelpReply, discordMessage, isPersonalCommand, scoutTextForCommand, scoutTextForComponent, EPHEMERAL } from '@/lib/discord/scout-bot';
import { publicPage, type BotReply } from '@/lib/telegram/marketplace-bot';
import { scoutReply } from '@/lib/telegram/scout';

export const dynamic = 'force-dynamic';

const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const PONG = 1;
const MESSAGE = 4;
const DEFERRED_MESSAGE = 5;
const MAX_BODY = 65_536;

type Interaction = {
  type?: unknown;
  token?: unknown;
  guild_id?: unknown;
  channel_id?: unknown;
  user?: { id?: unknown };
  member?: { user?: { id?: unknown } };
  data?: { name?: unknown; custom_id?: unknown; options?: unknown };
};

function interactionUser(interaction: Interaction): string | null {
  const id = interaction.member?.user?.id ?? interaction.user?.id;
  return typeof id === 'string' && /^\d{1,22}$/.test(id) ? id : null;
}

function firstOption(options: unknown): string | null {
  if (!Array.isArray(options)) return null;
  for (const option of options as Array<{ value?: unknown }>) {
    if (typeof option?.value === 'string' && option.value.trim()) return option.value;
  }
  return null;
}

function immediate(text: string): Response {
  return Response.json({ type: MESSAGE, data: { content: text, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });
}

/**
 * The answer is written after the acknowledgement, so it needs the request to
 * outlive the response. `after` does that on the server; called outside a
 * request scope it throws, and starting the work unawaited has the same effect
 * for this route, which only ever writes back to one interaction.
 */
function background(work: () => Promise<void>): void {
  try { after(work); } catch { void work(); }
}

/**
 * Discord allows three seconds to answer and fifteen minutes to finish.
 * A catalogue search or a model call can outlast the first, so the interaction
 * is acknowledged and the answer replaces the acknowledgement. Nothing here can
 * pay, hire or sign, so a Discord retry cannot repeat anything that costs.
 */
async function completeInteraction(token: string, reply: BotReply | null, fallback: BotReply): Promise<void> {
  const applicationId = process.env.POKTER_DISCORD_APPLICATION_ID;
  if (!applicationId) return;
  // The defer already fixed whether this is visible to the channel; flags cannot change now.
  const { content, components } = discordMessage(reply ?? fallback);
  try {
    const response = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, components: components ?? [], allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`Discord rejected the follow-up: ${response.status}`);
  } catch { /* The acknowledgement expires by itself; a half-written answer is worse than none. */ }
}

export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY) return new Response('Interaction too large', { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY) return new Response('Interaction too large', { status: 413 });
  if (!verifyDiscordRequest({
    body,
    signature: request.headers.get('x-signature-ed25519'),
    timestamp: request.headers.get('x-signature-timestamp'),
  })) {
    // Discord validates an endpoint by checking that a bad signature is refused.
    return new Response('invalid request signature', { status: 401 });
  }

  let interaction: Interaction;
  try { interaction = JSON.parse(body) as Interaction; }
  catch { return Response.json({ error: 'Invalid interaction' }, { status: 400 }); }
  if (interaction.type === PING) return Response.json({ type: PONG });
  if (interaction.type !== APPLICATION_COMMAND && interaction.type !== MESSAGE_COMPONENT) {
    return Response.json({ error: 'Unsupported interaction' }, { status: 400 });
  }

  const user = interactionUser(interaction);
  if (!user || typeof interaction.token !== 'string' || !process.env.POKTER_DISCORD_APPLICATION_ID) {
    return immediate('Scout could not read that interaction. Try the command again.');
  }

  const command = interaction.type === APPLICATION_COMMAND ? String(interaction.data?.name ?? '') : null;
  if (command === 'help') {
    return Response.json({ type: MESSAGE, data: discordMessage(discordHelpReply()) });
  }
  const message = command
    ? scoutTextForCommand(command, firstOption(interaction.data?.options))
    : scoutTextForComponent(String(interaction.data?.custom_id ?? ''));
  if (!message) return immediate('I don’t have that command any more. Use /help to see what I can do.');

  const rate = consumeRateLimit(`discord-scout:${user}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return immediate('You’ve asked me a lot at once. Try again in a minute, or browse Pokter directly.');

  const inGuild = typeof interaction.guild_id === 'string';
  const aiChannel = process.env.POKTER_DISCORD_AI_CHANNEL_ID;
  /*
   * Every message that reaches Scout here is a command addressed to it: the
   * endpoint receives interactions, never channel conversation. So the brain is
   * told this is a direct exchange, and where AI chat is allowed is decided
   * separately — a direct message, or the one channel the server opted in.
   */
  const ai = !inGuild || (!!aiChannel && interaction.channel_id === aiChannel);
  const ephemeral = inGuild && (isPersonalCommand(command ?? '') || interaction.type === MESSAGE_COMPONENT);
  const token = interaction.token;
  const fallback: BotReply = {
    text: 'Scout could not load that information right now. You can open Pokter directly and try again later.',
    reply_markup: { inline_keyboard: [[{ text: 'Open Pokter', url: publicPage('/discover') }]] },
  };

  background(async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const reply = await Promise.race([
      scoutReply(message, true, `discord:${user}`, { ai, alerts: false }).catch(() => fallback),
      new Promise<BotReply>((resolve) => { timeout = setTimeout(() => resolve(fallback), 11_000); }),
    ]);
    if (timeout) clearTimeout(timeout);
    await completeInteraction(token, reply, fallback);
  });

  return Response.json({ type: DEFERRED_MESSAGE, data: ephemeral ? { flags: EPHEMERAL } : {} });
}
