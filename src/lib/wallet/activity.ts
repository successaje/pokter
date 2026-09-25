'use client';

import type { GrantedSession } from '@/lib/altana/types';

const STORAGE_KEY = 'pokter.sessions.v1';
const EVENT_NAME = 'pokter:sessions-changed';
const EMPTY_SESSIONS: GrantedSession[] = [];
let cachedRaw: string | null = null;
let cachedSessions: GrantedSession[] = EMPTY_SESSIONS;
let cachedByWallet = new Map<string, GrantedSession[]>();

function readAll(): GrantedSession[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? '[]';
    if (raw === cachedRaw) return cachedSessions;
    const parsed = JSON.parse(raw);
    cachedRaw = raw;
    cachedSessions = Array.isArray(parsed) ? (parsed as GrantedSession[]) : EMPTY_SESSIONS;
    cachedByWallet = new Map();
    return cachedSessions;
  } catch {
    return EMPTY_SESSIONS;
  }
}

function writeAll(sessions: GrantedSession[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function sessionsForWallet(walletAddress: string): GrantedSession[] {
  const wallet = walletAddress.toLowerCase();
  const all = readAll();
  const cached = cachedByWallet.get(wallet);
  if (cached) return cached;
  const sessions = all.filter(
    (session) => session.walletAddress.toLowerCase() === wallet,
  );
  cachedByWallet.set(wallet, sessions);
  return sessions;
}

export function noSessions(): GrantedSession[] {
  return EMPTY_SESSIONS;
}

export function rememberSession(session: GrantedSession): void {
  const sessions = readAll().filter((existing) => existing.id !== session.id);
  writeAll([session, ...sessions]);
}

export function rememberRevocation(
  id: string,
  revokedAt: string,
  revokeTxHash: `0x${string}` | null,
): void {
  writeAll(
    readAll().map((session) =>
      session.id === id ? { ...session, revokedAt, revokeTxHash } : session,
    ),
  );
}

export function subscribeToSessions(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}
