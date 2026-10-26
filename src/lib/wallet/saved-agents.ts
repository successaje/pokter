'use client';

import { formatQuotedPrice, tokenLabel } from '@/lib/erc8183/pricing';

export const SAVED_AGENTS_KEY = 'pokter.saved-agents.v1';
export const SAVED_AGENTS_EVENT = 'pokter:saved-agents-changed';
const SAVED_SNAPSHOTS_KEY = 'pokter.saved-agents.snapshots.v1';
const SAVED_ALERTS_KEY = 'pokter.saved-agents.alerts.v1';

export interface SavedAgent {
  chainId: number;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  category: string;
  description: string;
  savedAt: string;
}

export interface SavedAgentSnapshot {
  chainId: number;
  tokenId: string;
  evidence: string;
  response: 'responding' | 'not-responding' | 'unmeasured';
  /** The current signed price as a number in `currency`, not necessarily $U; null when there is none. */
  priceU: number | null;
  /**
   * The token that price is signed in, or null when there is no price.
   * Absent on snapshots stored before prices carried a token: those are
   * compared on the number alone, never assumed to have been $U.
   */
  currency?: string | null;
  checkedAt: string;
}

export interface SavedAgentAlert {
  id: string;
  agentId: string;
  kind: 'evidence' | 'response' | 'price';
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export function savedAgentId(agent: Pick<SavedAgent, 'chainId' | 'tokenId'>): string {
  return `${agent.chainId}:${agent.tokenId}`;
}

export function readSavedAgents(): SavedAgent[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_AGENTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed as SavedAgent[] : [];
  } catch {
    return [];
  }
}

export function isAgentSaved(chainId: number, tokenId: string): boolean {
  const id = `${chainId}:${tokenId}`;
  return readSavedAgents().some((agent) => savedAgentId(agent) === id);
}

export function toggleSavedAgent(agent: Omit<SavedAgent, 'savedAt'>): boolean {
  const id = savedAgentId(agent);
  const current = readSavedAgents();
  const saved = current.some((entry) => savedAgentId(entry) === id);
  const next = saved
    ? current.filter((entry) => savedAgentId(entry) !== id)
    : [{ ...agent, savedAt: new Date().toISOString() }, ...current];
  window.localStorage.setItem(SAVED_AGENTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SAVED_AGENTS_EVENT));
  return !saved;
}

export function subscribeToSavedAgents(listener: () => void): () => void {
  window.addEventListener(SAVED_AGENTS_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(SAVED_AGENTS_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

function readLocalArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch { return []; }
}

export function readSavedAgentAlerts(): SavedAgentAlert[] {
  return readLocalArray<SavedAgentAlert>(SAVED_ALERTS_KEY);
}

export function markSavedAgentAlertsRead(): void {
  const now = new Date().toISOString();
  const next = readSavedAgentAlerts().map((alert) => alert.readAt ? alert : { ...alert, readAt: now });
  window.localStorage.setItem(SAVED_ALERTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SAVED_AGENTS_EVENT));
}

/* In the price's own token; a snapshot with no token says so rather than borrowing $U. */
function price(value: number | null, currency: string | null | undefined): string {
  return value === null ? 'no current signed price' : formatQuotedPrice(value, currency ?? null);
}

const sameToken = (a: string | null | undefined, b: string | null | undefined) => a!.toLowerCase() === b!.toLowerCase();

/**
 * Whether the price moved, compared on (currency, amount).
 *
 * The same 0.1 in USDT is not the 0.1 in $U it replaced, so a token change
 * at an unchanged number is a change. A currency is compared only when both
 * snapshots name one: older snapshots carry none, and an alert for a token
 * the earlier snapshot never recorded would be noise, not news.
 */
function priceChange(before: SavedAgentSnapshot, after: SavedAgentSnapshot): string | null {
  const tokenMoved = before.priceU !== null && after.priceU !== null && Boolean(before.currency && after.currency) && !sameToken(before.currency, after.currency);
  if (tokenMoved) {
    return `The currency changed from ${tokenLabel(before.currency)} to ${tokenLabel(after.currency)}: ${price(before.priceU, before.currency)} → ${price(after.priceU, after.currency)}`;
  }
  if (before.priceU !== after.priceU) return `${price(before.priceU, before.currency)} → ${price(after.priceU, after.currency)}`;
  return null;
}

export function savedAgentChanges(
  previousSnapshots: SavedAgentSnapshot[],
  nextSnapshots: SavedAgentSnapshot[],
  savedAgents: SavedAgent[],
): SavedAgentAlert[] {
  const previous = new Map(previousSnapshots.map((item) => [savedAgentId(item), item]));
  const saved = new Map(savedAgents.map((agent) => [savedAgentId(agent), agent]));
  const created: SavedAgentAlert[] = [];
  for (const snapshot of nextSnapshots) {
    const id = savedAgentId(snapshot);
    const before = previous.get(id);
    const agent = saved.get(id);
    if (!before || !agent) continue;
    const add = (kind: SavedAgentAlert['kind'], title: string, body: string) =>
      created.push({ id: `${id}:${kind}:${snapshot.checkedAt}`, agentId: id, kind, title, body, createdAt: snapshot.checkedAt, readAt: null });
    if (before.evidence !== snapshot.evidence) add('evidence', `${agent.name} evidence changed`, `${before.evidence} → ${snapshot.evidence}`);
    if (before.response !== snapshot.response) add('response', `${agent.name} availability changed`, `${before.response.replace('-', ' ')} → ${snapshot.response.replace('-', ' ')}`);
    const moved = priceChange(before, snapshot);
    if (moved) add('price', `${agent.name} price changed`, moved);
  }
  return created;
}

/** Store the first observation as a baseline; alert only on later transitions. */
export function applySavedAgentSnapshots(next: SavedAgentSnapshot[]): SavedAgentAlert[] {
  const previousItems = readLocalArray<SavedAgentSnapshot>(SAVED_SNAPSHOTS_KEY);
  const previous = new Map(previousItems.map((item) => [savedAgentId(item), item]));
  const savedAgents = readSavedAgents();
  const saved = new Map(savedAgents.map((agent) => [savedAgentId(agent), agent]));
  const existing = readSavedAgentAlerts();
  const existingIds = new Set(existing.map((item) => item.id));
  const created = savedAgentChanges(previousItems, next, savedAgents).filter((item) => !existingIds.has(item.id));
  const returned = new Set(next.map(savedAgentId));
  const preserved = [...previous.values()].filter((item) =>
    saved.has(savedAgentId(item)) && !returned.has(savedAgentId(item)),
  );
  window.localStorage.setItem(SAVED_SNAPSHOTS_KEY, JSON.stringify([...next, ...preserved]));
  if (created.length) {
    window.localStorage.setItem(SAVED_ALERTS_KEY, JSON.stringify([...created, ...existing].slice(0, 100)));
    window.dispatchEvent(new Event(SAVED_AGENTS_EVENT));
  }
  return created;
}
