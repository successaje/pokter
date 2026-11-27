/**
 * Scout on the website: what the chat window sends, and what comes back.
 *
 * Shared by the panel and the route, so the limits a browser is held to are
 * the ones the server checks. Nothing here reads a store or a key.
 *
 * The conversation lives in the visitor's browser, not on Pokter's server.
 * Each question carries the last few turns with it, and the route answers
 * and forgets. Evidence is the exception: the browser may name the agent it
 * is asking about, but what Scout says about that agent is read by the
 * server from Pokter's own records, never taken from the page.
 */

import { SUPPORT_EMAIL } from '@/lib/support/contact';

export type ScoutRole = 'user' | 'assistant';
export type ScoutTurn = { role: ScoutRole; content: string };
/** A page on Pokter, always a path: Scout never links off the site. */
export type ScoutLink = { label: string; href: string };
export type AgentRef = { chainId: 56 | 97; tokenId: string };

export type ScoutAnswer = {
  answer: string;
  links: ScoutLink[];
  /** Scout cannot help with this, and a person can: the panel offers the email. */
  handoff: boolean;
};

export type ScoutRequest = {
  message: string;
  turns: ScoutTurn[];
  /** The agent this conversation is about, from the button on its page. */
  about: AgentRef | null;
  /** Agents Scout's last answer linked to, for "which of those…". At most three. */
  recent: AgentRef[];
};

export const MESSAGE_LIMIT = 1200;
export const TURN_LIMIT = 6;
const TURN_CHARS = 1300;

/** The notice a visitor accepts before the first question. Bump it when the notice changes. */
export const CONSENT_VERSION = 1;

/** The model's last line when a person should take over. Stripped before display. */
export const HANDOFF_MARK = 'HANDOFF';

function agentRef(raw: unknown): AgentRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const { chainId, tokenId } = raw as { chainId?: unknown; tokenId?: unknown };
  const chain = Number(chainId);
  if (chain !== 56 && chain !== 97) return null;
  if (typeof tokenId !== 'string' || !/^\d{1,12}$/.test(tokenId)) return null;
  return { chainId: chain, tokenId };
}

/**
 * The request, or why it is refused.
 *
 * Turns are trimmed rather than refused: an old browser holding a longer
 * conversation should still get an answer, from its most recent part.
 */
export function parseScoutRequest(body: unknown): { ok: true; value: ScoutRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object.' };
  const raw = body as Record<string, unknown>;
  if (raw.consent !== CONSENT_VERSION) return { ok: false, error: 'Scout answers only after its notice is accepted.' };
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (!message) return { ok: false, error: 'Ask Scout something.' };
  if (message.length > MESSAGE_LIMIT) return { ok: false, error: `Keep a question under ${MESSAGE_LIMIT} characters.` };
  const turns = (Array.isArray(raw.turns) ? raw.turns : [])
    .flatMap((turn): ScoutTurn[] => {
      if (!turn || typeof turn !== 'object') return [];
      const { role, content } = turn as { role?: unknown; content?: unknown };
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return [];
      return [{ role, content: content.slice(0, TURN_CHARS) }];
    })
    .slice(-TURN_LIMIT);
  const recent = (Array.isArray(raw.recent) ? raw.recent : []).map(agentRef).filter((ref): ref is AgentRef => ref !== null).slice(0, 3);
  return { ok: true, value: { message, turns, about: agentRef(raw.about), recent } };
}

/**
 * A link from Scout's evidence, as a path on this site.
 *
 * Evidence is written with absolute links, for Telegram; the panel keeps a
 * visitor on the page they are on, so it wants paths. Anything not on
 * Pokter is dropped rather than shown.
 */
export function sitePath(url: string): string | null {
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    if (!/^(?:www\.)?pokter\.xyz$|^localhost$/.test(parsed.hostname)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/** The agent an agent-page link names, so a follow-up can be read against it. */
export function agentRefFromPath(path: string): AgentRef | null {
  const match = /^\/agents\/(56|97)\/(\d{1,12})(?:[/?#]|$)/.exec(path);
  return match ? { chainId: Number(match[1]) as 56 | 97, tokenId: match[2] } : null;
}

/** The answer without its handoff line, and whether it had one. */
export function takeHandoff(answer: string): { text: string; handoff: boolean } {
  const lines = answer.trimEnd().split('\n');
  const last = lines.at(-1)?.trim().replace(/[.*_`]/g, '');
  if (last !== HANDOFF_MARK) return { text: answer.trim(), handoff: false };
  return { text: lines.slice(0, -1).join('\n').trim(), handoff: true };
}

/**
 * An email to the team, already holding the question.
 *
 * Written by the visitor's own mail app, so Pokter stores nothing and the
 * visitor sees exactly what is sent before sending it.
 */
export function handoffMailto(question: string | null): string {
  const subject = 'A question for the Pokter team';
  const body = question ? `I asked Scout:\n\n${question.slice(0, 600)}\n\n` : '';
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
}
