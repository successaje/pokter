/**
 * Agents followed by email from this device, remembered here so an agent's
 * page can say it is followed. Follows live on the server against an email
 * address, which a page cannot look up without asking for it; this is the
 * device's own note of what it asked for and what was confirmed.
 */
export interface DeviceFollow {
  email: string | null;
  status: 'pending' | 'confirmed';
  at: string;
}

const KEY = 'pokter:follows';
const EVENT = 'pokter:follows-changed';
const EMPTY: Record<string, DeviceFollow> = {};
let cache: { raw: string | null; value: Record<string, DeviceFollow> } = { raw: null, value: EMPTY };

function read(): Record<string, DeviceFollow> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.value;
  let value: Record<string, DeviceFollow> = EMPTY;
  try {
    value = raw ? (JSON.parse(raw) as Record<string, DeviceFollow>) : EMPTY;
  } catch {
    value = EMPTY;
  }
  cache = { raw, value };
  return value;
}

function write(next: Record<string, DeviceFollow>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Storage blocked: the page simply cannot remember. */
  }
  window.dispatchEvent(new Event(EVENT));
}

export const followKey = (chainId: number, tokenId: string) => `${chainId}:${tokenId}`;

export function deviceFollow(chainId: number, tokenId: string): DeviceFollow | null {
  return read()[followKey(chainId, tokenId)] ?? null;
}

export function rememberFollow(chainId: number, tokenId: string, follow: Omit<DeviceFollow, 'at'>): void {
  const current = read();
  const previous = current[followKey(chainId, tokenId)];
  write({ ...current, [followKey(chainId, tokenId)]: { email: follow.email ?? previous?.email ?? null, status: follow.status, at: new Date().toISOString() } });
}

export function forgetFollow(chainId: number, tokenId: string): void {
  const next = { ...read() };
  delete next[followKey(chainId, tokenId)];
  write(next);
}

export function subscribeToFollows(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** e.g. "t***@example.com": enough to recognise, not enough to copy. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}
