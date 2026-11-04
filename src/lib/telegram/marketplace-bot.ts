/** Public bot copy and links. No wallet or request content is sent to Telegram. */
import { POKTER_SOCIAL_LINKS } from '@/lib/social/links';

export const MARKETPLACE_BOT_COMMANDS = [
  { command: 'start', description: 'Meet Scout and open the menu' },
  { command: 'find', description: 'Find an agent by task' },
  { command: 'check', description: 'Check an agent by link or ID' },
  { command: 'services', description: 'Explore published services' },
  { command: 'requests', description: 'Browse open requests' },
  { command: 'discord', description: 'Join the Pokter Discord' },
  { command: 'forget', description: 'Clear recent Scout chat' },
  { command: 'help', description: 'See bot commands' },
] as const;

export type BotButton = { text: string; url: string };
export type BotReply = {
  text: string;
  reply_markup: { inline_keyboard: BotButton[][] } | { keyboard: Array<Array<{ text: string }>>; resize_keyboard: true; is_persistent: true };
};

function siteUrl(path: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  let origin = 'https://pokter.xyz';
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')) origin = url.origin;
    } catch { /* Keep the canonical public origin. */ }
  }
  return `${origin}${path}`;
}

export function publicPage(path: string): string { return siteUrl(path); }

export function scoutMenu(): BotReply {
  const chatNote = process.env.SCOUT_OPENAI_API_KEY
    ? 'Tell me a task or ask about Pokter’s agents. AI helps me answer follow-ups using Pokter evidence; check the linked pages for details. Your messages go to our model provider. Recent chat is available for 24 hours; send /forget to clear it.'
    : 'Tell me a task and I’ll search Pokter’s current agent catalogue.';
  return {
    text: `Hi, I’m Scout. ${chatNote} Hiring and wallet approval stay on Pokter.\n\nNever send a seed phrase or private key here.`,
    reply_markup: {
      keyboard: [
        [{ text: 'Find an agent' }, { text: 'Check an agent' }],
        [{ text: 'Explore services' }, { text: 'Open requests' }],
        [{ text: 'Help' }, { text: 'Discord' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  };
}

export function marketplaceBotReply(message: string, isPrivate: boolean): BotReply | null {
  const match = /^\/([a-z]+)(?:@([a-z0-9_]+))?(?:\s|$)/i.exec(message.trim());
  if (!match && !isPrivate) return null;
  const mentionedBot = match?.[2];
  const ownUsername = process.env.POKTER_TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
  if (mentionedBot && (!ownUsername || mentionedBot.toLowerCase() !== ownUsername.toLowerCase())) return null;
  const command = match?.[1].toLowerCase() ?? '';
  if (command === 'start' || message.trim() === 'Back to menu') return scoutMenu();
  if (command === 'help' || message.trim() === 'Help') return {
    text: 'I’m Scout, Pokter’s guide. Send a task or ask a follow-up about the agents I show. Use /find <task>, /check <Pokter agent link or 56:ID or 97:ID>, /services, or /requests. Send /forget to clear your recent chat.\n\nPrices I show are previous signed quotes, never a price for your task. Hire and wallet approval happen on Pokter. Never send a seed phrase or private key.',
    reply_markup: { inline_keyboard: [[{ text: 'How Pokter works', url: siteUrl('/how-it-works') }, { text: 'Proof', url: siteUrl('/proof') }]] },
  };
  if (command === 'discord' || message.trim() === 'Discord') return {
    text: 'Join the Pokter community on Discord.',
    reply_markup: { inline_keyboard: [[{ text: 'Join Discord', url: POKTER_SOCIAL_LINKS.discord }]] },
  };
  return null;
}
