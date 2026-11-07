import 'server-only';

import { CATEGORIES } from '@/lib/agents/categories';
import type { AgentSummary } from '@/lib/api/v1';
import type { Service } from '@/lib/services/model';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { POKTER_SOCIAL_LINKS } from '@/lib/social/links';
import { marketplaceBotReply, publicPage, scoutMenu, type BotButton, type BotReply } from './marketplace-bot';
import { forgetChat, readChat, saveChat, type ChatKey } from './chat-store';
import { generateScoutAnswer } from './scout-gemini';
import { scoutKnowledgeFor } from './scout-knowledge';
import { isMoreAgentsFollowUp, matchingNamedAgents, namedAgentQuery, shouldSearchAgents } from './scout-routing';
import { requestAlertsOn, setRequestAlerts } from './request-alerts';

const network = (chainId: number) => chainId === 97 ? 'BNB Testnet' : 'BNB Mainnet';
const short = (text: string, max = 135) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
const link = (text: string, url: string): BotButton => ({ text, url });
const reply = (text: string, buttons: BotButton[][]): BotReply => ({ text, reply_markup: { inline_keyboard: buttons } });

function agentReference(text: string): { chainId: '56' | '97'; tokenId: string } | null {
  const raw = text.trim();
  const direct = /^(?:\/check\s+)?(56|97)[/:](\d{1,12})$/i.exec(raw);
  if (direct) return { chainId: direct[1] as '56' | '97', tokenId: direct[2] };
  try {
    const url = new URL(raw.replace(/^\/check\s+/i, ''));
    if (url.hostname !== 'pokter.xyz' && url.hostname !== 'www.pokter.xyz' && url.hostname !== 'localhost') return null;
    const path = /^\/agents\/(56|97)\/(\d{1,12})\/?$/.exec(url.pathname);
    return path ? { chainId: path[1] as '56' | '97', tokenId: path[2] } : null;
  } catch { return null; }
}

function categoryKeyboard(all: boolean): BotReply {
  const categories = all ? CATEGORIES : CATEGORIES.filter((c) => ['grid-trading', 'yield', 'rebalancing', 'health-factor'].includes(c.id));
  const rows: Array<Array<{ text: string }>> = [];
  for (let i = 0; i < categories.length; i += 2) rows.push(categories.slice(i, i + 2).map((c) => ({ text: c.label })));
  rows.push(all ? [{ text: 'Back to menu' }] : [{ text: 'All categories' }, { text: 'Back to menu' }]);
  return {
    text: 'What do you need done? Send a short task in your own words, or tap a category. I’ll search the same agent catalogue as Discover.',
    reply_markup: { keyboard: rows, resize_keyboard: true, is_persistent: true },
  };
}

function agentPrice(agent: AgentSummary): string {
  const price = agent.price.value;
  if (!price) return 'No signed price observed';
  const amount = price.amount && price.symbol ? `${price.amount} ${price.symbol}` : 'token or amount not verified';
  const expiry = price.current === false ? ' · expired' : price.current === null ? ' · expiry not stated' : '';
  return `Last signed quote ${amount} (${price.quotedAt.slice(0, 10)}${expiry}); fresh quote needed for your task`;
}

async function findAgents(query: string, category?: string, responsive = false): Promise<BotReply> {
  const [{ GET: agentsApi }, { agentRecord }] = await Promise.all([
    import('@/app/api/v1/agents/route'), import('@/lib/profiles/evidence'),
  ]);
  const url = new URL('https://pokter.xyz/api/v1/agents');
  url.searchParams.set('limit', responsive ? '100' : '3');
  const searchQuery = [query.slice(0, 120), responsive ? 'is:responsive' : ''].filter(Boolean).join(' ');
  if (searchQuery) url.searchParams.set('q', searchQuery);
  if (category) url.searchParams.set('category', category);
  const response = await agentsApi(new Request(url));
  if (!response.ok) return reply('I couldn’t search agents right now. Try a shorter task or open Discover.', [[link('Open Discover', publicPage('/discover'))]]);
  const data = await response.json() as { items: Array<AgentSummary & { hirable?: boolean }>; total: number };
  if (!data.items.length) return reply(responsive
    ? `I found no ${category ? `${CATEGORIES.find((c) => c.id === category)?.label ?? category} ` : ''}agents that answered a Pokter check in the last 24 hours. That does not prove none are operating; try again later or inspect Discover.`
    : 'I found no agents for that task in Pokter’s current catalogue. Try broader words or browse Discover.', [[link('Browse Discover', publicPage('/discover'))]]);
  const ranked = responsive ? [...data.items].sort((a, b) => Number(b.hirable === true) - Number(a.hirable === true)
    || (b.availability.value ?? 0) - (a.availability.value ?? 0)
    || b.probes.value.total - a.probes.value.total).slice(0, 3) : data.items;
  const lines = ranked.map((a, index) => {
    const probes = a.probes.value;
    const evidence = probes.total ? `${probes.answered}/${probes.total} Pokter checks answered` : 'No Pokter checks recorded';
    const jobs = agentRecord(a.chainId, a.tokenId, a.owner.value ?? '');
    const outside = jobs.mainnet.funded + jobs.testnet.funded;
    return `${index + 1}. ${short(a.name, 65)} · ${network(a.chainId)} · ID ${a.chainId}:${a.tokenId}\n${responsive ? 'Answered a Pokter check in the last 24 hours · ' : ''}${evidence} · ${a.verdictLabel}${a.hirable ? ' · direct hire shown on Pokter' : ''}\n${outside} outside-buyer funded ${outside === 1 ? 'job' : 'jobs'} (${jobs.mainnet.funded} mainnet, ${jobs.testnet.funded} testnet)\n${agentPrice(a)}`;
  });
  const browse = new URL(publicPage('/discover'));
  if (query) browse.searchParams.set('q', query);
  if (category) browse.searchParams.set('category', category);
  return reply(`Scout found ${data.total} matching ${responsive ? 'recently responsive ' : ''}${data.total === 1 ? 'agent' : 'agents'}${category ? ` in ${CATEGORIES.find((c) => c.id === category)?.label ?? category}` : ''}. Here are ${ranked.length}:\n\n${lines.join('\n\n')}\n\nChecks measure responses, not the quality of delivered work. A fresh quote and live hire check are still required.`, [...ranked.map((a) => [link(`Open ${short(a.name, 34)}`, publicPage(`/agents/${a.chainId}/${a.tokenId}`))]), [link('See all matches', browse.toString())]]);
}

async function findNamedAgent(name: string): Promise<BotReply> {
  const { GET: agentsApi } = await import('@/app/api/v1/agents/route');
  const url = new URL('https://pokter.xyz/api/v1/agents');
  url.searchParams.set('q', name);
  url.searchParams.set('limit', '50');
  const response = await agentsApi(new Request(url));
  if (!response.ok) return reply('I couldn’t check the agent catalogue right now. Try its name on Discover.', [[link('Search Discover', publicPage(`/discover?q=${encodeURIComponent(name)}`))]]);
  const data = await response.json() as { items: AgentSummary[] };
  const matches = matchingNamedAgents(name, data.items);
  if (!matches.length) return reply(`I couldn't verify an agent named “${short(name, 75)}” in Pokter's current catalogue. I won't substitute another listing.`, [[link('Search Discover', publicPage(`/discover?q=${encodeURIComponent(name)}`))]]);
  const details = await Promise.all(matches.slice(0, 3).map((agent) => checkAgent({ chainId: String(agent.chainId) as '56' | '97', tokenId: agent.tokenId })));
  return reply(`Yes — I found ${matches.length === 1 ? 'this agent' : `${matches.length} matching agents`} by name:\n\n${details.map((detail) => detail.text).join('\n\n')}`, details.flatMap((detail) => 'inline_keyboard' in detail.reply_markup ? detail.reply_markup.inline_keyboard : []));
}

type AgentDetail = {
  chainId: number; tokenId: string; name: string; owner: string | null;
  evidence: { verdictLabel: string; rationale: string; measurers: unknown[] };
  measured: { probes: number; answered: number; observedDays: number; lastSeen: string | null };
  price: { amount: string | null; symbol: string | null; current: boolean | null; quotedAt: string; payable: boolean | null } | null;
  notMeasured: Record<string, string>;
  links: { html: string };
};

async function checkAgent(ref: { chainId: '56' | '97'; tokenId: string }): Promise<BotReply> {
  const [{ GET: agentApi }, { agentRecord }] = await Promise.all([
    import('@/app/api/v1/agents/[chainId]/[tokenId]/route'),
    import('@/lib/profiles/evidence'),
  ]);
  const path = `/agents/${ref.chainId}/${ref.tokenId}`;
  const response = await agentApi(new Request(`https://pokter.xyz/api/v1${path}`), { params: Promise.resolve(ref) });
  if (!response.ok) return reply('I couldn’t read this agent’s evidence right now. The Pokter page may have more detail.', [[link('Open agent page', publicPage(path))]]);
  const a = await response.json() as AgentDetail;
  const checks = a.measured.probes ? `${a.measured.answered}/${a.measured.probes} checks answered over ${a.measured.observedDays} observed days${a.measured.lastSeen ? `; last checked ${a.measured.lastSeen.slice(0, 10)}` : ''}` : 'No Pokter checks recorded';
  const quote = a.price
    ? `Last signed quote: ${a.price.amount && a.price.symbol ? `${a.price.amount} ${a.price.symbol}` : 'amount or token not verified'} (${a.price.quotedAt.slice(0, 10)}; ${a.price.current === false ? 'expired' : a.price.current === null ? 'expiry not stated' : 'within stated expiry'}). A fresh quote for your brief is still required.`
    : 'No signed price observed. A fresh quote is needed before hiring.';
  const record = agentRecord(a.chainId, a.tokenId, a.owner ?? '');
  const outside = record.mainnet.funded + record.testnet.funded;
  const work = outside ? `${outside} outside-buyer funded ${outside === 1 ? 'job' : 'jobs'} (${record.mainnet.funded} mainnet, ${record.testnet.funded} testnet)` : 'No outside-buyer jobs recorded on Pokter';
  const note = a.evidence.measurers.length ? `${a.evidence.measurers.length} independent measurer records shown on Pokter` : 'No independent measurer records shown';
  const gaps = a.notMeasured ? 'Not measured: realised returns, drawdown, capital managed, or gas and slippage.' : 'Some outcomes may not have independent evidence.';
  return reply(`${short(a.name, 90)} · ${network(a.chainId)}\n\n${a.evidence.verdictLabel}. ${short(a.evidence.rationale, 200)}\n${checks}\n${work}\n${note}\n${quote}\n${gaps}\n\nThese are observations, not a guarantee of performance. Open the profile for sources.`, [[link('Open full evidence', publicPage(path))]]);
}

async function exploreServices(query: string): Promise<BotReply> {
  const [{ getServiceStore }, { getProbeStore }, { getProfileStore }, { quotePriceLabel }, { registryOwner }] = await Promise.all([
    import('@/lib/services/store'),
    import('@/lib/history/store'),
    import('@/lib/profiles/store'),
    import('@/lib/find/price'),
    import('@/lib/registry/onchain'),
  ]);
  const result = getServiceStore().list({ q: query.slice(0, 100), limit: 12 });
  const owners = await Promise.all(result.items.map((s) => registryOwner(s.chainId, s.tokenId).catch(() => null)));
  const visible = result.items.filter((s, i) => owners[i]?.toLowerCase() === s.builder.toLowerCase()).slice(0, 3);
  if (!visible.length) return reply(query ? 'No available published services match those words. Try a broader search.' : 'No builder-published services are available right now.', [[link('Browse services', publicPage('/services'))]]);
  const probes = getProbeStore();
  const lines = visible.map((service: Service, index) => {
    const profile = getProfileStore().get(service.builder);
    const builder = profile?.published ? profile.displayName || `@${profile.handle}` : `${service.builder.slice(0, 6)}…${service.builder.slice(-4)}`;
    const quote = probes.quotesFor([{ chainId: service.chainId, tokenId: service.tokenId }]).get(`${service.chainId}:${service.tokenId}`);
    const price = quote ? `Last quoted ${quotePriceLabel(quote)} on ${quote.quotedAt.slice(0, 10)}${quote.expiresAt && Date.parse(quote.expiresAt) <= Date.now() ? ' · expired' : ''}` : 'No signed price observed';
    return `${index + 1}. ${short(service.title, 70)} · ${network(service.chainId)}\nBy ${short(builder, 35)} · Agent #${service.tokenId}\n${price}. Fresh quote required for your brief.`;
  });
  return reply(`Builder-published services${query ? ` matching “${short(query, 60)}”` : ''}:\n\n${lines.join('\n\n')}`, visible.map((s) => [link(`Open ${short(s.title, 34)}`, publicPage(`/services/${s.id}`))]));
}

type PublicRequest = { id: string; title: string; network: string; budget: { label: string; testTokens: boolean }; targetBuilder: string | null; page: string; closesAt: string | null };

async function openRequests(query: string): Promise<BotReply> {
  const { GET: requestsApi } = await import('@/app/api/v1/requests/route');
  const url = new URL('https://pokter.xyz/api/v1/requests');
  url.searchParams.set('limit', '50');
  if (query) url.searchParams.set('q', query.slice(0, 120));
  const response = await requestsApi(new Request(url));
  if (!response.ok) return reply('I couldn’t read requests right now.', [[link('Open request board', publicPage('/requests'))]]);
  const data = await response.json() as { requests: PublicRequest[] };
  const open = data.requests.filter((r) => !r.targetBuilder).slice(0, 3);
  if (!open.length) return reply('No public open requests match right now. Builder-directed requests are not shown as work anyone can propose for.', [[link('Open request board', publicPage('/requests'))]]);
  const lines = open.map((r, index) => `${index + 1}. ${short(r.title, 80)} · ${r.network}\nBudget ${r.budget.label}${r.budget.testTokens ? ' (test tokens)' : ''}${r.closesAt ? ` · Proposals close ${r.closesAt.slice(0, 10)}` : ''}`);
  return reply(`Open requests on Pokter:\n\n${lines.join('\n\n')}\n\nA request is not a funded job. Read its terms before proposing.`, open.map((r) => [link(`Open request ${r.id.slice(0, 8)}`, publicPage(`/requests/${r.id}`))]));
}

function isFollowUp(text: string): boolean {
  return /^(which|what about|of those|and |the (first|second|third|one)|these|those|them|their|it |compare|how many|do any|does any|are any|is any|more about|tell me more|why |who |what is its|what is their)/i.test(text)
    || /\b(previous|above|result|recommendation)\b/i.test(text);
}

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|how are you|thanks|thank you|who are you)[?!.\s]*$/i.test(text);
}

function isProductQuestion(text: string): boolean {
  return /\b(what (?:are the things|can i|can you|is possible to).*(?:do|pokter)|what is pokter|how does pokter|how do i hire|how do requests work)\b/i.test(text);
}

function isAccountQuestion(text: string): boolean {
  return /\b(my (?:jobs|hires|agents)|keep track|build ai agents|builder workspace|(?:manage|monitor).*(?:jobs|hires))\b/i.test(text);
}

function isPaymentQuestion(text: string): boolean {
  return /\b(?:can i pay|pay here|hire here|how (?:do|can) i (?:hire|pay))\b/i.test(text);
}

export function scoutCategoryFor(text: string): string | undefined {
  return [
    { id: 'health-factor', pattern: /health factor|liquidation|collateral|lending position/i },
    { id: 'grid-trading', pattern: /grid|ladder|dca bot/i },
    { id: 'rebalancing', pattern: /rebalanc|allocation|portfolio weight/i },
    { id: 'yield', pattern: /yield|apy|staking|vault|farming/i },
    { id: 'token-safety', pattern: /token safety|honeypot|rug pull|contract safety/i },
    { id: 'research', pattern: /research|due diligence/i },
    { id: 'content', pattern: /content|copywriting|blog/i },
    { id: 'trading', pattern: /trading|trade signal/i },
  ].find((entry) => entry.pattern.test(text))?.id;
}

export function scoutActiveCategory(text: string, lastCategory?: string | null): string | undefined {
  return /\b(active|working|responsive|online|dry)\b/i.test(text) ? lastCategory ?? undefined : undefined;
}

async function marketEvidence(text: string): Promise<BotReply> {
  const plainQuery = (value: string) => value.replace(/\b(can|could|you|i|want|need|looking|find|show|me|available|published|for|about|please|any|are|there|a|an|the|with|to)\b/gi, ' ').replace(/[^a-z0-9\s-]/gi, ' ').trim();
  if (/\b(services?|offers?)\b/i.test(text)) {
    const query = plainQuery(text.replace(/\b(services?|offers?)\b/gi, ' '));
    return exploreServices(query);
  }
  if (/\b(requests?|work to bid|open work)\b/i.test(text) && !/how do requests work/i.test(text)) {
    const query = plainQuery(text.replace(/\b(open|public|requests?|work|bid)\b/gi, ' '));
    return openRequests(query);
  }
  const category = scoutCategoryFor(text);
  if (category) return findAgents('', category);
  const terms = plainQuery(text.replace(/\b(agent|agents|bot|bots|help|task|that|does|do|my)\b/gi, ' ')).split(/\s+/).filter(Boolean);
  return findAgents(terms.slice(0, 2).join(' ') || text);
}

async function chatWithScout(raw: string, chatId: ChatKey): Promise<BotReply> {
  if (/\b(seed phrase|recovery phrase|private key)\b/i.test(raw) || /\b0x[a-fA-F0-9]{64}\b/.test(raw)) {
    return reply('Please keep wallet secrets out of chat. I can help you compare public Pokter evidence instead.', [[link('Open Pokter', publicPage('/discover'))]]);
  }
  const perChat = consumeRateLimit(`scout-ai:${chatId}`, { limit: 12, windowMs: 15 * 60_000 });
  const global = consumeRateLimit('scout-ai:global', { limit: 120, windowMs: 60 * 60_000 });
  if (!perChat.allowed || !global.allowed) return reply('Scout has reached its chat limit for now. You can still browse Pokter directly.', [[link('Open Discover', publicPage('/discover'))]]);

  const state = readChat(chatId);
  const direct = isGreeting(raw)
    ? reply(/^how are you/i.test(raw) ? 'I’m well, thanks. Tell me what you want an agent to do, or ask about Pokter.' : 'Hi! I’m Scout. Yes, we can chat — ask me about Pokter, an agent, or a task you have in mind.', [[link('Explore Pokter', publicPage('/discover'))]])
    : /\b(?:hold|have|keep|continue)\s+(?:a\s+)?conversation\b|\b(?:chat|talk)\s+with\s+you\b/i.test(raw)
      ? reply('Yes. You can chat with me about Pokter, agents, and the work you want done. I’ll search listings when you ask me to, and I’ll say when I can’t verify something.', [[link('Explore Pokter', publicPage('/discover'))]])
    : isAccountQuestion(raw)
      ? reply('I can help plan an agent, explain public evidence and guide you through Pokter. I cannot see or monitor your private jobs, hires or agents in Telegram. Connect your wallet on Pokter to see them in your workspace. For building, use Build; for buyer jobs, use Your jobs. Scout alerts and wallet-linked tracking are not available yet.', [[link('Your jobs', publicPage('/workspace/jobs'))], [link('Build agents', publicPage('/build/agents'))], [link('Builder jobs', publicPage('/build/jobs'))]])
      : isPaymentQuestion(raw)
        ? reply('Hiring and wallet approval happen on Pokter. Choose an agent, write a brief, review a fresh signed quote and the network, then confirm any funded hire in your wallet. Scout cannot take payment in Telegram.', [[link('Find an agent', publicPage('/discover'))], [link('How hiring works', publicPage('/how-it-works'))]])
      : isProductQuestion(raw)
        ? reply('On Pokter you can find and compare agents, check their evidence, browse builder-published services, post a request, hire with a fresh signed quote, and track jobs after connecting your wallet. Builders can publish agents and services and respond to requests. Scout can explain public listings, but cannot see your private workspace from Telegram.', [[link('Discover agents', publicPage('/discover'))], [link('Browse services', publicPage('/services'))], [link('Your workspace', publicPage('/workspace'))]])
        : null;
  if (direct) {
    saveChat(chatId, { ...state, turns: [...state.turns, { role: 'user', content: raw }, { role: 'assistant', content: direct.text }] });
    return direct;
  }
  const previousUser = [...state.turns].reverse().find((turn) => turn.role === 'user')?.content;
  const named = namedAgentQuery(raw) ?? (/\bdid you read my message\b/i.test(raw) && previousUser ? namedAgentQuery(previousUser) : null);
  if (named) {
    const found = await findNamedAgent(named);
    const result = namedAgentQuery(raw) ? found : { ...found, text: `Sorry, I missed your question about ${named}.\n\n${found.text}` };
    const buttons = 'inline_keyboard' in result.reply_markup ? result.reply_markup.inline_keyboard : [];
    saveChat(chatId, { ...state, turns: [...state.turns, { role: 'user', content: raw }, { role: 'assistant', content: result.text }], evidence: result.text, buttons, lastAgentCategory: null });
    return result;
  }
  if (isMoreAgentsFollowUp(raw)) {
    const count = /Scout found (\d+) matching[\s\S]*?Here are (\d+):/.exec(state.evidence);
    const browseButton = state.buttons.find((row) => row.some((button) => button.text === 'See all matches'));
    const result = count && Number(count[1]) > Number(count[2])
      ? reply(`Yes — I showed ${count[2]} of ${count[1]} matching agents. Open all matches to see the rest.`, browseButton ? [browseButton] : [[link('Browse Discover', publicPage('/discover'))]])
      : reply(count ? 'Those were all the matches I found for that search. Try broader words or browse Discover.' : 'Which agents do you mean? Tell me the task or agent name and I’ll check.', [[link('Browse Discover', publicPage('/discover'))]]);
    saveChat(chatId, { ...state, turns: [...state.turns, { role: 'user', content: raw }, { role: 'assistant', content: result.text }] });
    return result;
  }
  if (/\bdid you read my message\b/i.test(raw)) {
    const result = reply(previousUser ? `I read your previous message: “${short(previousUser, 180)}”. Sorry I missed the point. Tell me what you want me to check, and I’ll stay with it.` : 'Sorry — I missed your point. Please repeat what you want me to check.', []);
    saveChat(chatId, { ...state, turns: [...state.turns, { role: 'user', content: raw }, { role: 'assistant', content: result.text }] });
    return result;
  }
  const activeFollowUp = !!scoutActiveCategory(raw, state.lastAgentCategory);
  const usePrevious = !!state.evidence && isFollowUp(raw) && !activeFollowUp;
  const search = activeFollowUp
    ? await findAgents('', state.lastAgentCategory ?? undefined, true)
    : !usePrevious && shouldSearchAgents(raw) ? await marketEvidence(raw) : null;
  const evidence = search?.text ?? (usePrevious ? state.evidence : '');
  const buttons = search && 'inline_keyboard' in search.reply_markup
    ? search.reply_markup.inline_keyboard : usePrevious ? state.buttons : [];
  if (search && (activeFollowUp || search.text.startsWith('I found no'))) {
    saveChat(chatId, { ...state, turns: [...state.turns, { role: 'user', content: raw }, { role: 'assistant', content: search.text }], evidence, buttons, lastAgentCategory: activeFollowUp ? state.lastAgentCategory : scoutCategoryFor(raw) ?? null });
    return search;
  }
  try {
    const knowledge = scoutKnowledgeFor(raw);
    const answer = await generateScoutAnswer({ message: raw, turns: state.turns, evidence, docs: knowledge.context, apiKey: process.env.SCOUT_GEMINI_API_KEY! });
    saveChat(chatId, {
      turns: [...state.turns, { role: 'user', content: raw }, { role: 'assistant', content: answer }],
      evidence, buttons, aiEnabled: true,
      lastAgentCategory: activeFollowUp ? state.lastAgentCategory : search ? scoutCategoryFor(raw) ?? null : state.lastAgentCategory,
    });
    const responseButtons = [...buttons, ...knowledge.links.map((doc) => [link(doc.text, publicPage(doc.path))])].slice(0, 5);
    return reply(answer, responseButtons.length ? responseButtons : [[link('Explore Pokter', publicPage('/discover'))]]);
  } catch {
    return search ?? reply('I couldn’t complete that answer right now. Ask me again in a moment, or browse Pokter directly.', buttons.length ? buttons : [[link('Open Discover', publicPage('/discover'))]]);
  }
}

/**
 * What a transport lets Scout offer. Telegram allows both. Discord asks for
 * neither: a bot that opens direct messages is the shape of the scam the server
 * warns about, and AI chat belongs where only the asker reads the answer.
 */
export type ScoutOptions = { ai?: boolean; alerts?: boolean };

const AI_ELSEWHERE = 'AI chat with Scout is not available here. Message Scout directly and ask again, or tell me a task and I’ll search the catalogue.';

export async function scoutReply(message: string, isPrivate: boolean, chatId?: ChatKey, options: ScoutOptions = {}): Promise<BotReply | null> {
  const raw = message.trim();
  if (!isPrivate && /^\/(?:start|help)(?:@[a-z0-9_]+)?$/i.test(raw)) {
    const username = process.env.POKTER_TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
    const mention = /@([a-z0-9_]+)$/i.exec(raw)?.[1];
    if (mention && (!username || mention.toLowerCase() !== username.toLowerCase())) return null;
    return reply('I’m Scout. Message me privately to search agents, check evidence and explore Pokter. You can also use /find <task> here.', username ? [[link('Open Scout', `https://t.me/${username}`)]] : [[link('Open Pokter', publicPage('/discover'))]]);
  }
  const staticReply = marketplaceBotReply(raw, isPrivate);
  if (staticReply) return staticReply;
  if (!isPrivate && !raw.startsWith('/')) return null;
  if (isPrivate && (raw === '/forget' || raw === 'Forget chat')) {
    if (chatId !== undefined) forgetChat(chatId);
    return reply('I’ve cleared your recent Scout conversation from Pokter.', [[link('Open Discover', publicPage('/discover'))]]);
  }
  if (isPrivate && (raw === '/ai' || raw === 'Chat with Scout')) {
    if (options.ai === false) return reply(AI_ELSEWHERE, [[link('Open Discover', publicPage('/discover'))]]);
    if (!process.env.SCOUT_GEMINI_API_KEY) return reply('AI chat is not available yet. You can still search agents and check evidence here.', [[link('Open Discover', publicPage('/discover'))]]);
    return reply(
      'AI chat uses Gemini’s free tier. Google may use submitted content to improve its products. Your messages and recent Scout context go to Gemini; never send private keys, passwords or confidential briefs. Pokter keeps recent chat available for 24 hours, and /forget clears it.\n\nTap Enable AI chat if you agree.',
      [[{ text: 'Enable AI chat', callback_data: 'scout:enable_ai' }], [link('Read privacy policy', publicPage('/privacy'))]],
    );
  }
  if (isPrivate && raw === 'Enable AI chat') {
    if (options.ai === false) return reply(AI_ELSEWHERE, [[link('Open Discover', publicPage('/discover'))]]);
    if (!process.env.SCOUT_GEMINI_API_KEY || chatId === undefined) return reply('AI chat is not available yet. You can still search agents here.', [[link('Open Discover', publicPage('/discover'))]]);
    const state = readChat(chatId);
    saveChat(chatId, { ...state, aiEnabled: true });
    return reply('AI chat is on. Ask me about an agent or describe a task. I’ll use Pokter evidence and link you to the source. Send /forget to clear this chat.', [[link('Browse agents', publicPage('/discover'))]]);
  }
  if (isPrivate && (raw === 'Alerts' || /^\/alerts(?:\s+(?:on|off))?$/i.test(raw))) {
    if (chatId === undefined) return null;
    if (options.alerts === false) return reply('Request alerts are only available in Scout on Telegram for now. Everything else works the same here.', [[link('Open Scout on Telegram', POKTER_SOCIAL_LINKS.telegram)]]);
    if (/^\/alerts\s+on$/i.test(raw)) setRequestAlerts(chatId, true);
    if (/^\/alerts\s+off$/i.test(raw)) setRequestAlerts(chatId, false);
    const on = requestAlertsOn(chatId);
    return reply(on
      ? 'New public request alerts are on. Scout will message you when a new open request is posted. Alerts may arrive after the next Pokter check. Builder-directed requests and older requests are excluded. Turn them off anytime with /alerts off. /forget clears AI chat separately.'
      : 'New public request alerts are off. Turn them on to hear about newly posted open requests. Scout never sends builder-directed briefs or old requests as alerts.',
    [[{ text: on ? 'Turn off alerts' : 'Turn on alerts', callback_data: on ? 'scout:alerts:off' : 'scout:alerts:on' }], [link('Browse open requests', publicPage('/requests'))]]);
  }
  if (raw === 'Find an agent' || raw === '/find' || raw === '/discover') return categoryKeyboard(false);
  if (raw === 'All categories' || raw === '/categories') return categoryKeyboard(true);
  if (raw === 'Check an agent' || raw === '/check') return reply('Send a Pokter agent URL or a network and ID, such as 56:123 or 97:123. I’ll show what Pokter has measured and what remains missing.', [[link('Browse agents', publicPage('/discover'))]]);
  const ref = agentReference(raw);
  if (ref) return checkAgent(ref);
  if (raw.startsWith('/check ')) return reply('I need a Pokter agent URL or 56:ID / 97:ID. The network matters.', [[link('Browse agents', publicPage('/discover'))]]);
  if (raw === 'Explore services' || raw === '/services') return exploreServices('');
  if (raw.startsWith('/services ')) return exploreServices(raw.slice(10).trim());
  if (raw === 'Open requests' || raw === '/requests') return openRequests('');
  if (raw.startsWith('/requests ')) return openRequests(raw.slice(10).trim());
  if (raw.startsWith('/find ')) return findAgents(raw.slice(6).trim());
  const category = CATEGORIES.find((c) => c.label.toLowerCase() === raw.toLowerCase());
  if (category) return findAgents('', category.id);
  if (raw.startsWith('/')) return isPrivate ? scoutMenu() : null;
  if (!isPrivate) return null;
  return process.env.SCOUT_GEMINI_API_KEY && options.ai !== false && chatId !== undefined && readChat(chatId).aiEnabled ? chatWithScout(raw, chatId) : findAgents(raw);
}
