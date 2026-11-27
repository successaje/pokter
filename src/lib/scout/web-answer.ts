import 'server-only';

import { CATEGORIES, GENERAL_CATEGORY_LABEL } from '@/lib/agents/categories';
import { toAgentSummary } from '@/lib/api/v1';
import { searchById } from '@/lib/marketplace';
import { AVAILABILITY_LABEL, VERDICT_MEANING } from '@/lib/proof/engine';
import { agentRecord } from '@/lib/profiles/evidence';
import { offersDirectHire, verdictFor } from '@/lib/search/match';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { clipAtWord } from '@/lib/ui/clip';
import type { BotReply } from '@/lib/telegram/marketplace-bot';
import { agentReference, findAgents, isFollowUp, marketEvidence } from '@/lib/telegram/scout';
import { generateScoutAnswer } from '@/lib/telegram/scout-gemini';
import { scoutDocsFor, scoutKnowledgeFor } from '@/lib/telegram/scout-knowledge';
import { holdsWalletSecret, namedAgentQuery, shouldSearchAgents } from '@/lib/telegram/scout-routing';
import { HANDOFF_MARK, sitePath, takeHandoff, type AgentRef, type ScoutAnswer, type ScoutLink, type ScoutRequest } from './web-chat';

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
When the question needs a person rather than Pokter's public evidence and guides (a problem with the visitor's own job, payment, refund, dispute or account; a bug; a partnership or press question; or a question about Pokter the documentation does not answer), say in one sentence that the Pokter team can help by email, then end the answer with a final line containing only ${HANDOFF_MARK}. Do not write the email address: the page shows it. Never say you have contacted anyone, and never promise when they will reply.`;

/*
 * Twelve questions in fifteen minutes per visitor, as in Telegram, and a
 * site-wide ceiling an hour that protects the model's quota. Both within
 * the hour the limiter keeps a counter for: a longer window would be
 * cleared before it closed.
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

/**
 * One agent, from Pokter's records only.
 *
 * `searchById` reads the registry entry and the evidence Pokter stores for
 * it, the same entry Discover shows. Null when the registry has no such
 * agent or cannot be read: Scout then says it could not check.
 */
export async function agentEvidence(ref: AgentRef): Promise<{ text: string; links: ScoutLink[] } | null> {
  const [entry] = await searchById(ref.chainId, ref.tokenId).catch(() => []);
  if (!entry) return null;
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
  return { text: lines.join('\n'), links: [{ label: `Open ${clipAtWord(a.name, 34)}`, href: `/agents/${a.chainId}/${a.tokenId}` }] };
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

  /* What Scout reads for this question, each part from Pokter's records. */
  const parts: Array<{ text: string; links: ScoutLink[] }> = [];
  const pasted = agentReference(message);
  const subjects = [about, pasted ? { chainId: Number(pasted.chainId) as 56 | 97, tokenId: pasted.tokenId } : null]
    .filter((ref): ref is AgentRef => ref !== null)
    .filter((ref, i, all) => all.findIndex((other) => other.chainId === ref.chainId && other.tokenId === ref.tokenId) === i);
  for (const ref of subjects) {
    const read = await agentEvidence(ref);
    parts.push(read ?? { text: `Agent ${ref.chainId}:${ref.tokenId}: Pokter could not read its record just now.`, links: [] });
  }
  const named = namedAgentQuery(message);
  const search = named ? await findAgents(named) : !pasted && shouldSearchAgents(message) ? await marketEvidence(message) : null;
  if (search) parts.push({ text: search.text, links: linksFrom(search) });
  if (!search && !subjects.length && recent.length && isFollowUp(message)) {
    for (const ref of recent) {
      const read = await agentEvidence(ref);
      if (read) parts.push(read);
    }
  }

  const knowledge = scoutKnowledgeFor(message);
  const evidence = parts.map((part) => part.text).join('\n\n');
  const evidenceLinks = parts.flatMap((part) => part.links);
  const docLinks = knowledge.links.map((doc) => ({ label: doc.text, href: doc.path }));
  const apiKey = process.env.SCOUT_GEMINI_API_KEY;

  if (apiKey) {
    try {
      const raw = await generateScoutAnswer({ message, turns, evidence, docs: knowledge.context, apiKey, channelInstructions: WEB_INSTRUCTIONS });
      const { text, handoff } = takeHandoff(raw);
      if (text) return { ok: true, value: { answer: text, links: unique([...evidenceLinks, ...docLinks]), handoff } };
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
    return { ok: true, value: { answer: evidence, links: unique([...evidenceLinks, ...docLinks]), handoff: false } };
  }
  const guides = scoutDocsFor(message);
  if (guides.length) {
    return {
      ok: true,
      value: {
        answer: guides.map((doc) => `${doc.label}: ${doc.facts}`).join('\n\n'),
        links: unique(guides.map((doc) => ({ label: doc.label, href: doc.path }))),
        handoff: false,
      },
    };
  }
  return {
    ok: true,
    value: {
      answer: 'I can’t write a full answer just now. I can still explain an agent from its page, or a question about hiring, prices, requests or evidence. For anything else, the Pokter team can help by email.',
      links: unique(docLinks),
      handoff: true,
    },
  };
}
