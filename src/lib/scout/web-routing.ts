import { isConversationQuestion, isMoreAgentsFollowUp, shouldSearchAgents } from '@/lib/telegram/scout-routing';

/*
 * When Scout on the website looks something up.
 *
 * Telegram looks an agent up only for a few fixed phrasings ("an agent
 * called X") and searches only for a few more ("find an agent for X"). A
 * visitor asks the way they would ask a person: "Tell me more about
 * BrinkWatch", "What agents can I hire for yield?". Both reached the model
 * with nothing looked up, and Scout said no such agent existed while
 * Pokter listed it on both networks.
 *
 * So the website reads the common shapes of those questions. A name read
 * this way is only a candidate: the catalogue decides whether an agent has
 * it, and the caller matches it strictly (see `nameMatches`).
 */

/** Words for Pokter itself and how it works. "What is escrow?" is a question for the guides, not a name. */
const POKTER_TERMS = /^(?:pokter\S*(?:\s.*)?|escrow|testnet|mainnet|bnb(?: chain| testnet)?|bsc|a2a|mcp|erc[- ]?\d+|x402|gas|scout|discover|services?|requests?|proposals?|jobs?|quotes?|signed (?:prices?|quotes?)|prices?|evidence|checks?|verdicts?|proof|receipts?|refunds?|disputes?|deadlines?|wallets?|agentic wallets?|agent ids?|hiring|builders?|builder studio|studio|attestations?|feedback|methodology|guides?|workspace|this site|this website)$/i;

/** A reference back to the conversation ("tell me more about it"), which the follow-up path answers. */
const BACK_REFERENCE = /^(?:it|its|this|that|these|those|them|they|their|one|you|yourself|me|us|him|her|the (?:first|second|third|last|other|same|one)|both|either|each)\b/i;

/** Questions about one thing by name, with the name captured. Matched against the message without its final punctuation. */
const ASKED_ABOUT = [
  /\b(?:tell me|talk|know|say)\s+(?:a (?:bit|little)\s+|some(?:thing)?\s+|anything\s+)?(?:more\s+)?about\s+(.+)$/i,
  /^(?:more (?:about|on)|info(?:rmation)? (?:about|on)|details (?:about|on|of)|thoughts on|what about|explain|describe|review|check|look up)\s+(.+)$/i,
  /^(?:what|who)(?:\s+(?:is|are)|['’]s)\s+(.+)$/i,
  /^what\s+does\s+(.+?)\s+do$/i,
  /^(?:is|are)\s+(.+?)\s+(?:any good|good|reliable|safe|legit|legitimate|trustworthy|real|active|working|online|worth (?:it|hiring))$/i,
  /^how\s+(?:good|reliable|safe|active|expensive|much)\s+is\s+(.+)$/i,
  /^can i (?:trust|hire|use)\s+(.+)$/i,
];

/**
 * The name a question asks about, if it reads as one.
 *
 * Null for a kind of thing ("a signed price", "yield agents"), for Pokter's
 * own vocabulary, and for a reference back to the conversation.
 */
export function agentNameIn(text: string): string | null {
  const message = text.trim().replace(/[?.!\s]+$/, '');
  for (const pattern of ASKED_ABOUT) {
    const raw = pattern.exec(message)?.[1]?.trim();
    if (raw) return nameFrom(raw);
  }
  return null;
}

function nameFrom(raw: string): string | null {
  if (BACK_REFERENCE.test(raw)) return null;
  /* "a signed price", "an agent for yield", "any trading bots": a kind of thing, not one by name. */
  if (/^(?:an?|any|some|all|every|other|more|your|my|our)\s/i.test(raw)) return null;
  const name = raw
    .replace(/^the\s+/i, '')
    .replace(/^(?:agent|bot)\s+(?:called\s+|named\s+)?/i, '')
    .replace(/\s+(?:agent|bot)$/i, '')
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .trim();
  if (/\b(?:agents|bots)$/i.test(name)) return null;
  if (name.length < 3 || name.length > 60 || name.split(/\s+/).length > 6) return null;
  if (POKTER_TERMS.test(name)) return null;
  return name;
}

/**
 * Whether a candidate reads as a proper name: a capital or a digit, as
 * people write names. A lowercase phrase that matches no agent is more
 * likely a topic ("what is yield farming"), so Scout does not announce it
 * has no agent by that name.
 */
export function looksLikeName(name: string): boolean {
  return /[A-Z0-9]/.test(name);
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A strict name match, for a name read from an ordinary question: the
 * agent's name is the candidate, or starts with it as whole words. So
 * "BrinkWatch" finds "Brinkwatch by Pokter", and "escrow" would not find
 * "Escrow Guardian Pro" through a word in the middle of its name.
 */
export function nameMatches(candidate: string, agentName: string): boolean {
  const wanted = normalize(candidate);
  const name = normalize(agentName);
  if (!wanted || !name) return false;
  return name === wanted || name.startsWith(`${wanted} `) || normalize(agentName.replace(/\s+/g, '')) === normalize(candidate.replace(/\s+/g, ''));
}

/**
 * Whether the visitor is asking for agents that do something, so Scout
 * should search the catalogue. Wider than Telegram's rule, and still not a
 * how-to question ("How do I hire an agent?" is the hiring guide's) or a
 * builder talking about their own agent.
 */
export function asksForAgents(text: string): boolean {
  const message = text.trim();
  if (shouldSearchAgents(message)) return true;
  if (isConversationQuestion(message) || isMoreAgentsFollowUp(message)) return false;
  if (/^(?:how|why|when|where)\b/i.test(message) && !/\b(?:find|search|choose|pick|compare)\b/i.test(message)) return false;
  if (/\b(?:my|our)\s+(?:own\s+)?(?:agents?|bots?)\b|\b(?:list|register|build|built|publish|deploy)\b/i.test(message)) return false;
  /* "Explain this agent": the one already in the conversation, not a search. */
  if (/\b(?:this|that|the same)\s+(?:agent|bot)\b/i.test(message)) return false;
  return /\b(?:which|what|any|some|best|good|top|recommended|reliable|active|cheap|cheapest)\s+(?:[\w-]+\s+){0,3}(?:agents?|bots?)\b/i.test(message)
    || /\b(?:agents?|bots?)\s+(?:can|could|i can|that|which|who|for|to|regarding|about|available)\b/i.test(message)
    || /\b(?:an?)\s+(?:[\w-]+\s+){1,3}(?:agent|bot)\b/i.test(message)
    || /\b(?!(?:the|these|those|all|other|more|your|my|our|of|any)\b)[a-z][\w-]{2,}\s+(?:agents|bots)\b/i.test(message)
    || /\bhire\b.{0,60}\b(?:for|regarding|to|about|that|who)\b/i.test(message);
}
