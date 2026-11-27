import 'server-only';

import { CATALOGUE_PER_CATEGORY, CATEGORIES, GENERAL_CATEGORY_LABEL } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { toAgentSummary } from '@/lib/api/v1';
import { listSearchable, searchById, searchByName } from '@/lib/marketplace';
import { AVAILABILITY_LABEL, VERDICT_MEANING } from '@/lib/proof/engine';
import { agentRecord } from '@/lib/profiles/evidence';
import { offersDirectHire, verdictFor } from '@/lib/search/match';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { clipAtWord } from '@/lib/ui/clip';
import type { BotReply } from '@/lib/telegram/marketplace-bot';
import { agentReference, isFollowUp, marketEvidence, scoutCategoryFor } from '@/lib/telegram/scout';
import { generateScoutAnswer } from '@/lib/telegram/scout-gemini';
import { scoutDocsFor, scoutKnowledgeFor } from '@/lib/telegram/scout-knowledge';
import { holdsWalletSecret, matchingNamedAgents, namedAgentQuery } from '@/lib/telegram/scout-routing';
import { HANDOFF_MARK, sitePath, takeHandoff, type AgentRef, type ScoutAnswer, type ScoutLink, type ScoutRequest } from './web-chat';
import { agentNameIn, asksForAgents, looksLikeName, nameMatches } from './web-routing';

/*
 * Scout's answers on the website.
 *
 * The same Scout as in Telegram: the same model, the same rules against
 * inventing agents, prices or links, the same guides. Two things differ.
 *
 * The conversation is the browser's. The route answers from what the
 * question carries and keeps nothing but a rate-limit counter.
 *
 * And asking about an agent reads only what Pokter already holds: its
 * registry record and Pokter's stored checks, prices and jobs. The agent
 * page's own dossier is not used, because building it calls the agent (a
 * live check, and a price request when it has never been priced), and a
 * visitor asking a question about an agent has not asked to contact it.
 */

const SITE = 'https://pokter.xyz';
const network = (chainId: number) => (chainId === 97 ? 'BNB Testnet (test tokens, no monetary value)' : 'BNB Chain mainnet');

const WEB_INSTRUCTIONS = `This conversation is in Scout's chat window on pokter.xyz. On the website Scout cannot see the visitor's wallet, jobs, requests or workspace, and cannot contact agents, send messages or take any action.
When the visitor asks about one agent, explain it in plain words a newcomer understands: what its builder says it does (the builder's claim, not verified), what Pokter's checks show and what they do not, its last signed price if any, and what hiring it would involve. Translate terms such as signed price, escrow and testnet the first time they appear.
When the question needs a person rather than Pokter's public evidence and guides (a problem with the visitor's own job, payment, refund, dispute or account; a bug; a partnership or press question; or a question about Pokter the documentation does not answer), say in one sentence that the Pokter team can help by email, then end the answer with a final line containing only ${HANDOFF_MARK}. Do not write the email address: the page shows it. Never say you have contacted anyone, and never promise when they will reply.
The page shows the links in links_below_answer under your answer, and no others. When you suggest opening a page, name one of those; when the list is empty, do not mention links, profiles or pages to open.
An empty pokter_evidence means the message did not ask about an agent, so none was looked up: answer from pokter_docs and the conversation, and if the visitor seems to mean an agent, ask for its name or the task they have in mind. Never talk about evidence being retrieved or missing; say plainly what Pokter has or does not have.`;

/*
 * Twelve questions in fifteen minutes per visitor, as in Telegram, and a
 * site-wide ceiling an hour that protects the model's quota.
 */
const VISITOR_LIMIT = { limit: 12, windowMs: 15 * 60_000 };
const SITE_LIMIT = { limit: 120, windowMs: 60 * 60_000 };

export type ScoutOutcome = { ok: true; value: ScoutAnswer } | { ok: false; status: 429; retryAfterSeconds: number };

function linksFrom(reply: BotReply): ScoutLink[] {
  if (!('inline_keyboard' in reply.reply_markup)) return [];
  return reply.reply_markup.inline_keyboard.flat().flatMap((button) => {
    if (!('url' in button) || typeof button.url !== 'string') return [];
    const href = sitePath(button.url);
    return href ? [{ label: button.text, href }] : [];
  });
}

function jobsLine(chainId: number, tokenId: string, owner: string | null): string {
  const record = agentRecord(chainId, tokenId, owner ?? '');
  const outside = record.mainnet.funded + record.testnet.funded;
  if (!outside) return 'Paid work: no jobs from outside buyers recorded on Pokter yet.';
  const settled = record.mainnet.settledUndisputed + record.testnet.settledUndisputed;
  return `Paid work: ${outside} ${outside === 1 ? 'job' : 'jobs'} funded by outside buyers through escrow (${record.mainnet.funded} on mainnet, ${record.testnet.funded} on testnet with test tokens); ${settled} settled without a dispute.`;
}

/** A catalogue entry: the registry row and the evidence Pokter stores for it, as Discover shows it. */
type CatalogueEntry = Awaited<ReturnType<typeof searchById>>[number];
type EvidencePart = { text: string; links: ScoutLink[] };

/**
 * One agent, from Pokter's records only.
 *
 * `searchById` reads the registry entry and the evidence Pokter stores for
 * it, the same entry Discover shows. Null when the registry has no such
 * agent or cannot be read: Scout then says it could not check.
 */
export async function agentEvidence(ref: AgentRef): Promise<EvidencePart | null> {
  const [entry] = await searchById(ref.chainId, ref.tokenId).catch(() => []);
  return entry ? evidenceFrom(entry) : null;
}

function evidenceFrom(entry: CatalogueEntry): EvidencePart {
  const verdict = verdictFor(entry);
  const a = toAgentSummary(entry.listing, entry.record, verdict, SITE);
  const category = a.category.value ? CATEGORIES.find((c) => c.id === a.category.value)?.label ?? a.category.value : GENERAL_CATEGORY_LABEL;
  const probes = a.probes.value;
  const price = a.price.value;
  const description = a.description.value ? clipAtWord(a.description.value.replace(/\s+/g, ' '), 360) : null;
  const lines = [
    `${a.name} · ${network(a.chainId)} · agent ${a.chainId}:${a.tokenId}`,
    `Category, assigned by Pokter from its registration: ${category}.`,
    description ? `What its builder says it does (their claim, not verified): ${description}` : 'Its builder has published no description.',
    probes.awaitingAgent
      ? 'Pokter checks: the address answers with a platform listing that has no agent connected yet, so nothing is counted.'
      : probes.total
        ? `Pokter checks, as its Discover card reads them: ${AVAILABILITY_LABEL[verdict]}. ${VERDICT_MEANING[verdict]} It answered ${probes.answered} of ${probes.total} checks over ${probes.observedDays} observed days. A check measures whether it replies, not whether its work is good. The agent page weighs who else measured it and may read differently; it has the full evidence.`
        : 'Pokter checks: none recorded yet, so how reliably it replies is not measured. The agent page has the full evidence.',
    price
      ? `Last signed price: ${price.amount && price.symbol ? `${price.amount} ${price.symbol}` : 'amount or token not verified'}, signed by its registered wallet on ${price.quotedAt.slice(0, 10)}${price.current === false ? ', now expired' : ''}. That was for an earlier brief; a hire asks for a fresh price for the visitor's own brief.`
      : 'Last signed price: none on record. A hire would first ask it to sign a price for the brief.',
    ...(offersDirectHire(entry) ? ['Hiring: Discover marks it as ready to hire directly: it answers checks and any price it signed can be paid through escrow.'] : []),
    jobsLine(a.chainId, a.tokenId, a.owner.value),
    `Registry feedback entries: ${a.attestations.value} (a count only; it says nothing about who wrote them).`,
  ];
  /* The same agent is often registered on both networks under one name; the label says which page is which. */
  const label = `Open ${clipAtWord(a.name, 34)}${a.chainId === 97 ? ' (testnet)' : ''}`;
  return { text: lines.join('\n'), links: [{ label, href: `/agents/${a.chainId}/${a.tokenId}` }] };
}

const discoverLink = (name: string): ScoutLink => ({ label: `Search Discover for “${clipAtWord(name, 28)}”`, href: `/discover?q=${encodeURIComponent(name)}` });

/**
 * The agents with the name the visitor asked about, found as Discover finds
 * a name: in the catalogue's pool, then by asking the registry by name for
 * an agent in no category (Pokter's own, for one). Mainnet first, at most
 * three, and each entry already carries the evidence Scout explains, so no
 * second read can fail for one network and not the other.
 *
 * `loose` is for an explicit "an agent called X", and keeps Telegram's
 * match: any name containing it. A name read from an ordinary question
 * must match strictly (see `nameMatches`), because "what is escrow" should
 * not find an agent with escrow in the middle of its name.
 *
 * Null when the catalogue could not be read, which is not the same as no
 * such agent.
 */
async function agentsNamed(name: string, loose: boolean): Promise<CatalogueEntry[] | null> {
  const pick = (entries: CatalogueEntry[]) => {
    const listed = entries.filter((entry) => isPromotableAgent(entry.listing.agent));
    const named = listed.map((entry) => ({ entry, name: entry.listing.agent.name }));
    return (loose ? matchingNamedAgents(name, named) : named.filter((item) => nameMatches(name, item.name))).map((item) => item.entry);
  };
  try {
    let found = pick(await listSearchable({ limit: CATALOGUE_PER_CATEGORY }));
    if (!found.length) found = pick(await searchByName(name));
    const seen = new Set<string>();
    return found
      .filter((entry) => {
        const key = `${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`;
        return seen.has(key) ? false : (seen.add(key), true);
      })
      .sort((a, b) => Number(b.listing.agent.chain_id === 56) - Number(a.listing.agent.chain_id === 56))
      .slice(0, 3);
  } catch {
    return null;
  }
}

function limited(clientKey: string): number | null {
  const visitor = consumeRateLimit(`scout-web:${clientKey}`, VISITOR_LIMIT);
  if (!visitor.allowed) return visitor.retryAfterSeconds;
  const site = consumeRateLimit('scout-web:site', SITE_LIMIT);
  return site.allowed ? null : site.retryAfterSeconds;
}

function unique(links: ScoutLink[]): ScoutLink[] {
  const seen = new Set<string>();
  return links.filter((link) => (seen.has(link.href) ? false : (seen.add(link.href), true))).slice(0, 4);
}

export async function webScoutAnswer(request: ScoutRequest, clientKey: string): Promise<ScoutOutcome> {
  const { message, turns, about, recent } = request;
  if (holdsWalletSecret(message)) {
    return { ok: true, value: { answer: 'Please keep wallet secrets out of chat: Scout never needs a seed phrase or private key, and nobody at Pokter will ask for one. I can explain an agent or how hiring works instead.', links: [], handoff: false } };
  }
  const retryAfterSeconds = limited(clientKey);
  if (retryAfterSeconds !== null) return { ok: false, status: 429, retryAfterSeconds };

  /* What Scout reads for this question, each part from Pokter's records, each agent once. */
  const parts: Array<{ text: string; links: ScoutLink[] }> = [];
  const read = new Set<string>();
  /* Adds one agent's part, unless an earlier part already has it. */
  const addAgent = async (ref: AgentRef, required: boolean) => {
    const key = `${ref.chainId}:${ref.tokenId}`;
    if (read.has(key)) return;
    read.add(key);
    const found = await agentEvidence(ref);
    if (found) parts.push(found);
    else if (required) parts.push({ text: `Agent ${key}: Pokter could not read its record just now.`, links: [] });
  };
  const addEntry = (entry: CatalogueEntry) => {
    const key = `${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`;
    if (read.has(key)) return;
    read.add(key);
    parts.push(evidenceFrom(entry));
  };
  const pasted = agentReference(message);
  const subjects = [about, pasted ? { chainId: Number(pasted.chainId) as 56 | 97, tokenId: pasted.tokenId } : null]
    .filter((ref): ref is AgentRef => ref !== null);
  for (const ref of subjects) await addAgent(ref, true);

  /* An agent asked about by name: explicitly ("an agent called X"), or the way people ask ("tell me more about X"). */
  const explicit = namedAgentQuery(message);
  const asked = pasted ? null : explicit ?? agentNameIn(message);
  const named = asked ? await agentsNamed(asked, explicit !== null) : [];
  const foundByName = named?.length ?? 0;
  if (named === null) {
    parts.push({ text: `Pokter could not search its catalogue for “${asked}” just now.`, links: asked ? [discoverLink(asked)] : [] });
  }
  for (const entry of named ?? []) addEntry(entry);

  /* Agents for a task, or for the kind of thing a name turned out to be ("tell me about yield farming"). */
  const wantsSearch = !pasted && (asksForAgents(message) || (asked !== null && named !== null && foundByName === 0 && !!scoutCategoryFor(asked)));
  const search = wantsSearch ? await marketEvidence(message) : null;
  if (search) parts.push({ text: search.text, links: linksFrom(search) });

  const docs = scoutDocsFor(message);
  /*
   * A name that matched nothing is said so, with a search to try, when it
   * reads as a name: asked for explicitly, or capitalised as names are and
   * not something the guides answer ("What is Builder Studio?").
   */
  if (asked && named !== null && !foundByName && !search && (explicit !== null || (looksLikeName(asked) && !docs.length))) {
    parts.push({ text: `Pokter's catalogue has no agent named “${asked}” on BNB Chain or BNB Testnet. The name may be spelled differently, or the agent may not be registered.`, links: [discoverLink(asked)] });
  }
  if (!parts.length && recent.length && isFollowUp(message)) {
    for (const ref of recent) await addAgent(ref, false);
  }

  const knowledge = scoutKnowledgeFor(message);
  const evidence = parts.map((part) => part.text).join('\n\n');
  const evidenceLinks = parts.flatMap((part) => part.links);
  /* Only the guides this question touches: a link under every answer, greetings included, is noise. */
  const docLinks = docs.map((doc) => ({ label: doc.label, href: doc.path }));
  const links = unique([...evidenceLinks, ...docLinks]);
  const apiKey = process.env.SCOUT_GEMINI_API_KEY;

  if (apiKey) {
    try {
      const raw = await generateScoutAnswer({
        message, turns, evidence, docs: knowledge.context, apiKey,
        channelInstructions: WEB_INSTRUCTIONS, links: links.map((link) => link.label), emptyEvidence: '',
      });
      const { text, handoff } = takeHandoff(raw);
      if (text) return { ok: true, value: { answer: text, links, handoff } };
    } catch {
      /* Falls through to the evidence itself, which is still Pokter's and still true. */
    }
  }
  /*
   * Without the model (no key here, a timeout, or its free quota spent),
   * Scout still answers in Pokter's own words: the evidence it read, or the
   * guide the question touches, and offers a person only when it has
   * neither.
   */
  if (evidence) {
    return { ok: true, value: { answer: evidence, links, handoff: false } };
  }
  if (docs.length) {
    return {
      ok: true,
      value: { answer: docs.map((doc) => `${doc.label}: ${doc.facts}`).join('\n\n'), links, handoff: false },
    };
  }
  return {
    ok: true,
    value: {
      answer: 'I can’t write a full answer just now. I can still explain an agent from its page, or a question about hiring, prices, requests or evidence. For anything else, the Pokter team can help by email.',
      links,
      handoff: true,
    },
  };
}
