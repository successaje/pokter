import 'server-only';

import { CATEGORIES } from '@/lib/agents/categories';
import type { AgentSummary } from '@/lib/api/v1';
import type { Service } from '@/lib/services/model';
import { marketplaceBotReply, publicPage, scoutMenu, type BotButton, type BotReply } from './marketplace-bot';

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

async function findAgents(query: string, category?: string): Promise<BotReply> {
  const { GET: agentsApi } = await import('@/app/api/v1/agents/route');
  const url = new URL('https://pokter.xyz/api/v1/agents');
  url.searchParams.set('limit', '3');
  if (query) url.searchParams.set('q', query.slice(0, 120));
  if (category) url.searchParams.set('category', category);
  const response = await agentsApi(new Request(url));
  if (!response.ok) return reply('I couldn’t search agents right now. Try a shorter task or open Discover.', [[link('Open Discover', publicPage('/discover'))]]);
  const data = await response.json() as { items: AgentSummary[]; total: number };
  if (!data.items.length) return reply('I found no agents for that task in Pokter’s current catalogue. Try broader words or browse Discover.', [[link('Browse Discover', publicPage('/discover'))]]);
  const lines = data.items.map((a, index) => {
    const probes = a.probes.value;
    const evidence = probes.total ? `${probes.answered}/${probes.total} Pokter checks answered` : 'No Pokter checks recorded';
    return `${index + 1}. ${short(a.name, 65)} · ${network(a.chainId)}\n${evidence} · ${a.verdictLabel}\n${agentPrice(a)}`;
  });
  return reply(`Scout found ${data.total} matching ${data.total === 1 ? 'agent' : 'agents'}. Here are ${data.items.length}:\n\n${lines.join('\n\n')}\n\nChecks measure responses, not the quality of delivered work.`, data.items.map((a) => [link(`Open ${short(a.name, 34)}`, publicPage(`/agents/${a.chainId}/${a.tokenId}`))]));
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

export async function scoutReply(message: string, isPrivate: boolean): Promise<BotReply | null> {
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
  return isPrivate ? findAgents(raw) : null;
}
