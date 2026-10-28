'use client';

import type { RequestMatch } from './matching';
import { amountText, requestUnit } from './model';

const KEY = 'pokter.request-alerts.v1';
const EVENT = 'pokter:request-alerts-changed';
/** Enough for months of requests; older alerts fall off the end. */
const KEEP = 200;

export interface RequestAlert {
  id: string;
  walletAddress: string;
  requestId: string;
  title: string;
  body: string;
  /** When the request was posted, so alerts sort with the rest of the inbox by when things happened. */
  createdAt: string;
  readAt: string | null;
}

/**
 * "A request your agent could answer", one per request per wallet.
 *
 * Kept in this browser like the rest of the inbox, which is derived on the
 * device that shows it. Once recorded an alert is never re-created, so
 * reading or clearing one sticks even while the request stays open.
 */
function readAll(): RequestAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as RequestAlert[]) : [];
  } catch {
    return [];
  }
}

function write(alerts: RequestAlert[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(alerts.slice(0, KEEP)));
  } catch {
    /* Storage full or blocked: the alerts are still derivable next visit. */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function requestAlertsFor(wallet: string): RequestAlert[] {
  const self = wallet.toLowerCase();
  return readAll().filter((a) => a.walletAddress === self);
}

export function subscribeToRequestAlerts(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** The wording of one alert: what was asked, for how much, and which of your agents fits. */
export function alertCopy(match: RequestMatch): { title: string; body: string } {
  const { request, agents } = match;
  const fits = agents.length === 1 ? `${agents[0].name} fits` : `${agents[0].name} and ${agents.length - 1} more of your agents fit`;
  /* In the request's own money, marked when it is test money: "2.00 USDT", "0.10 test $U". */
  return {
    title: 'A request your agent could answer',
    body: `“${request.title}” · up to ${amountText(request.budgetU)} ${requestUnit(request)}. ${fits} its category.`,
  };
}

/** Records alerts for matches not seen before; returns how many were new. */
export function recordRequestAlerts(wallet: string, matches: RequestMatch[]): number {
  const self = wallet.toLowerCase();
  const all = readAll();
  const known = new Set(all.filter((a) => a.walletAddress === self).map((a) => a.requestId));
  const fresh = matches
    .filter((m) => !known.has(m.request.id))
    .map((m) => ({ id: `request:${self}:${m.request.id}`, walletAddress: self, requestId: m.request.id, ...alertCopy(m), createdAt: m.request.postedAt, readAt: null }));
  if (fresh.length > 0) write([...fresh, ...all]);
  return fresh.length;
}

export function markRequestAlertRead(id: string): void {
  const now = new Date().toISOString();
  const all = readAll();
  if (!all.some((a) => a.id === id && !a.readAt)) return;
  write(all.map((a) => (a.id === id && !a.readAt ? { ...a, readAt: now } : a)));
}

export function markRequestAlertsRead(wallet: string): void {
  const self = wallet.toLowerCase();
  const now = new Date().toISOString();
  write(readAll().map((a) => (a.walletAddress === self && !a.readAt ? { ...a, readAt: now } : a)));
}
