'use client';

const KEY = 'pokter.price-ask-alerts.v1';
const EVENT = 'pokter:price-ask-alerts-changed';
const KEEP = 200;

export interface PriceAskAlert {
  id: string;
  walletAddress: string;
  /** `chainId:tokenId` of the agent buyers asked about. */
  agentKey: string;
  title: string;
  body: string;
  /** The newest ask it reports, so it sorts with the rest of the inbox by when it happened. */
  createdAt: string;
  readAt: string | null;
}

/**
 * "Buyers asked for your agent's price", for the wallet that owns it.
 *
 * Derived on the device that shows it, like request alerts, from the
 * public ask counts (`/api/price-asks`). One per agent per day of asks: a
 * second buyer the same day does not ring again, a buyer the next day does.
 */
function readAll(): PriceAskAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as PriceAskAlert[]) : [];
  } catch {
    return [];
  }
}

function write(alerts: PriceAskAlert[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(alerts.slice(0, KEEP)));
  } catch {
    /* Storage full or blocked: the alerts are still derivable next visit. */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function priceAskAlertsFor(wallet: string): PriceAskAlert[] {
  const self = wallet.toLowerCase();
  return readAll().filter((a) => a.walletAddress === self);
}

export function subscribeToPriceAskAlerts(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export interface PriceAskTally {
  chainId: number;
  tokenId: string;
  name: string;
  asks: number;
  latestAt: string;
}

/** The wording of one alert. */
export function priceAskCopy(tally: PriceAskTally): { title: string; body: string } {
  return {
    title: tally.asks === 1 ? `A buyer asked for ${tally.name}’s price` : `${tally.asks} buyers asked for ${tally.name}’s price`,
    body: 'They asked while it could not be priced, so it could not be hired through escrow. Its page in Building says what to fix.',
  };
}

/** Records an alert for each agent whose newest ask is on a day not alerted before; returns how many were new. */
export function recordPriceAskAlerts(wallet: string, tallies: PriceAskTally[]): number {
  const self = wallet.toLowerCase();
  const all = readAll();
  const known = new Set(all.map((a) => a.id));
  const fresh = tallies
    .map((t) => ({ tally: t, id: `price-ask:${self}:${t.chainId}:${t.tokenId}:${t.latestAt.slice(0, 10)}` }))
    .filter(({ id }) => !known.has(id))
    .map(({ tally, id }) => ({ id, walletAddress: self, agentKey: `${tally.chainId}:${tally.tokenId}`, ...priceAskCopy(tally), createdAt: tally.latestAt, readAt: null }));
  if (fresh.length > 0) write([...fresh, ...all]);
  return fresh.length;
}

export function markPriceAskAlertRead(id: string): void {
  const now = new Date().toISOString();
  const all = readAll();
  if (!all.some((a) => a.id === id && !a.readAt)) return;
  write(all.map((a) => (a.id === id && !a.readAt ? { ...a, readAt: now } : a)));
}

export function markPriceAskAlertsRead(wallet: string): void {
  const self = wallet.toLowerCase();
  const now = new Date().toISOString();
  write(readAll().map((a) => (a.walletAddress === self && !a.readAt ? { ...a, readAt: now } : a)));
}

/** Where an alert leads: the agent's page in Building, which carries the fix. */
export function priceAskHref(alert: Pick<PriceAskAlert, 'agentKey'>): string {
  return `/build/agents/${alert.agentKey.replace(':', '/')}`;
}
