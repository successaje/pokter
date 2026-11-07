/**
 * Discord is a second transport for Scout, not a second bot.
 *
 * The answers come from the shared brain in `@/lib/telegram/scout`, so a
 * question asked here and in Telegram gets the same evidence and the same
 * refusals. This file only reshapes one of its replies for Discord: a reply
 * keyboard becomes buttons, and nothing the catalogue supplied can post a link
 * or formatting into a channel.
 */
import { CATEGORIES } from '@/lib/agents/categories';
import { publicPage, type BotButton, type BotReply } from '@/lib/telegram/marketplace-bot';

/** Only this user sees the reply. */
export const EPHEMERAL = 64;

const STRING_OPTION = 3;
/** Installed to the server, usable in its channels and in a direct message with Scout. */
const CONTEXTS = [0, 1];
const INTEGRATION_TYPES = [0];

export const DISCORD_SCOUT_COMMANDS = [
  {
    name: 'scout', description: 'Ask Scout about an agent, its evidence, or a task you need done',
    contexts: CONTEXTS, integration_types: INTEGRATION_TYPES,
    options: [{ type: STRING_OPTION, name: 'message', description: 'Your question, or the work you need done', required: true, max_length: 400 }],
  },
  {
    name: 'find', description: 'Find an agent by task',
    contexts: CONTEXTS, integration_types: INTEGRATION_TYPES,
    options: [{ type: STRING_OPTION, name: 'task', description: 'The work you need done', required: false, max_length: 200 }],
  },
  {
    name: 'check', description: 'Check one agent’s evidence by link or ID',
    contexts: CONTEXTS, integration_types: INTEGRATION_TYPES,
    options: [{ type: STRING_OPTION, name: 'agent', description: 'A Pokter agent link, or 56:ID / 97:ID', required: false, max_length: 200 }],
  },
  {
    name: 'services', description: 'Explore builder-published services',
    contexts: CONTEXTS, integration_types: INTEGRATION_TYPES,
    options: [{ type: STRING_OPTION, name: 'task', description: 'Words to search the published services for', required: false, max_length: 200 }],
  },
  {
    name: 'requests', description: 'Browse open requests buyers have posted',
    contexts: CONTEXTS, integration_types: INTEGRATION_TYPES,
    options: [{ type: STRING_OPTION, name: 'task', description: 'Words to search the open requests for', required: false, max_length: 200 }],
  },
  { name: 'ai', description: 'Choose AI chat with Scout', contexts: CONTEXTS, integration_types: INTEGRATION_TYPES },
  { name: 'forget', description: 'Clear your recent Scout chat', contexts: CONTEXTS, integration_types: INTEGRATION_TYPES },
  { name: 'help', description: 'See what Scout can do here', contexts: CONTEXTS, integration_types: INTEGRATION_TYPES },
] as const;

export type DiscordCommand = (typeof DISCORD_SCOUT_COMMANDS)[number]['name'];

/** A command a channel should not answer in front of everyone. */
const PERSONAL_COMMANDS = new Set<string>(['scout', 'ai', 'forget']);

export function isPersonalCommand(name: string): boolean { return PERSONAL_COMMANDS.has(name); }

/**
 * Buttons come back as a custom id the clicker could have copied from any
 * message Scout posted, so only this fixed set can reach the brain. Free text
 * arrives through `/scout`, where it is held to the same rules as a Telegram
 * private message.
 */
const COMPONENT_TEXT: Record<string, string> = { 'scout:enable_ai': 'Enable AI chat' };
const SPOKEN_BUTTONS = new Set<string>([
  'Find an agent', 'Check an agent', 'Explore services', 'Open requests', 'Help',
  'All categories', 'Back to menu', 'Chat with Scout',
  ...CATEGORIES.map((category) => category.label),
]);

export function scoutTextForComponent(customId: string): string | null {
  if (customId in COMPONENT_TEXT) return COMPONENT_TEXT[customId];
  const spoken = customId.startsWith('scout:say:') ? customId.slice('scout:say:'.length) : null;
  return spoken && SPOKEN_BUTTONS.has(spoken) ? spoken : null;
}

/**
 * Every Discord message reaching the brain is an explicit command, so a leading
 * slash in free text is stripped: the real commands are registered with Discord
 * and `/scout` must not be a way to reach the others by typing them.
 */
export function scoutTextForCommand(name: string, value: string | null): string | null {
  const argument = value?.trim().slice(0, 400) ?? '';
  switch (name) {
    case 'scout': return argument.replace(/^[\s/]+/, '').trim() || null;
    case 'find': return argument ? `/find ${argument}` : '/find';
    case 'check': return argument ? `/check ${argument}` : '/check';
    case 'services': return argument ? `/services ${argument}` : '/services';
    case 'requests': return argument ? `/requests ${argument}` : '/requests';
    case 'ai': return '/ai';
    case 'forget': return '/forget';
    default: return null;
  }
}

/** Discord's own command list is the help, so this names what is here, not Telegram's menu. */
export function discordHelpReply(): BotReply {
  return {
    text: 'I’m Scout, Pokter’s guide to AI agents on BNB Chain.\n\n/find <task> searches the agent catalogue.\n/check <link or 56:ID> shows what Pokter has measured for one agent, and what is missing.\n/services and /requests list builder-published services and open requests.\n/scout <message> asks me anything; /ai turns on AI chat where it is available, and /forget clears it.\n\nPrices I show are previous signed quotes, never a price for your task. Hiring and wallet approval happen on Pokter, in your own wallet.\n\nI will never ask for a seed phrase or private key, and I never send payment links. Anything in a direct message claiming to be Pokter and asking for those is not Pokter.',
    reply_markup: { inline_keyboard: [[{ text: 'How Pokter works', url: publicPage('/how-it-works') }, { text: 'Proof', url: publicPage('/proof') }]] },
  };
}

type DiscordButton =
  | { type: 2; style: 5; label: string; url: string }
  | { type: 2; style: 2; label: string; custom_id: string };
type DiscordActionRow = { type: 1; components: DiscordButton[] };
export type DiscordMessage = {
  content: string;
  components?: DiscordActionRow[];
  allowed_mentions: { parse: [] };
  flags?: number;
};

const MAX_CONTENT = 1_900;
const MAX_LABEL = 80;
const MAX_ROWS = 5;
const BUTTONS_PER_ROW = 5;

/**
 * Scout never writes a URL into its text: links are attached as buttons Pokter
 * built, and the model is refused outright if it supplies one. So anything
 * link-shaped in the text came out of a registry name, a service title or a
 * request a stranger wrote, and the bot will not post it into a server whose
 * own rules hold members to the same line.
 */
function withoutLinks(text: string): string {
  return text
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[link removed]')
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/gi, '[link removed]')
    .replace(/\b(?:discord\.gg|t\.me|discordapp\.com)\b/gi, '[link removed]');
}

/** A name full of asterisks must not come out as a heading or a fake label. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|])/g, '\\$1');
}

function trimLabel(text: string): string {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1).trimEnd()}…` : text;
}

function discordButton(button: BotButton): DiscordButton | null {
  if ('url' in button) {
    try {
      if (new URL(button.url).protocol !== 'https:') return null;
    } catch { return null; }
    return { type: 2, style: 5, label: trimLabel(button.text), url: button.url };
  }
  return button.callback_data in COMPONENT_TEXT
    ? { type: 2, style: 2, label: trimLabel(button.text), custom_id: button.callback_data }
    : null;
}

function discordRows(reply: BotReply): DiscordActionRow[] {
  const flat: DiscordButton[] = [];
  if ('inline_keyboard' in reply.reply_markup) {
    for (const button of reply.reply_markup.inline_keyboard.flat()) {
      const converted = discordButton(button);
      if (converted) flat.push(converted);
    }
  } else {
    // Telegram's persistent keyboard has no Discord equivalent; its entries are
    // texts the brain already answers, so each becomes a button that says one.
    for (const key of reply.reply_markup.keyboard.flat()) {
      if (SPOKEN_BUTTONS.has(key.text)) flat.push({ type: 2, style: 2, label: trimLabel(key.text), custom_id: `scout:say:${key.text}` });
    }
  }
  const rows: DiscordActionRow[] = [];
  for (let i = 0; i < flat.length && rows.length < MAX_ROWS; i += BUTTONS_PER_ROW) {
    rows.push({ type: 1, components: flat.slice(i, i + BUTTONS_PER_ROW) });
  }
  return rows;
}

export function discordMessage(reply: BotReply, options: { ephemeral?: boolean } = {}): DiscordMessage {
  const text = escapeMarkdown(withoutLinks(reply.text));
  const rows = discordRows(reply);
  return {
    content: text.length > MAX_CONTENT ? `${text.slice(0, MAX_CONTENT - 1).trimEnd()}…` : text,
    ...(rows.length ? { components: rows } : {}),
    allowed_mentions: { parse: [] },
    ...(options.ephemeral ? { flags: EPHEMERAL } : {}),
  };
}
