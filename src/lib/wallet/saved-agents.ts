'use client';

export const SAVED_AGENTS_KEY = 'pokter.saved-agents.v1';
export const SAVED_AGENTS_EVENT = 'pokter:saved-agents-changed';

export interface SavedAgent {
  chainId: number;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  category: string;
  description: string;
  savedAt: string;
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
