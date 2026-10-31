/**
 * The browser side of the cross-device attempt record (`remote-attempts`).
 *
 * Best effort by design: the server is a second line behind the local,
 * lock-owned journal, so a server that cannot be reached never stops a hire
 * on its own — it only adds what this device cannot see by itself.
 */

/** What another device is shown: enough to recognise and recover the attempt, never the brief or the secret. */
export interface PublicAttempt {
  publicId: string;
  chainId: number;
  verified: boolean;
  startedAt: string;
  updatedAt: string;
  jobId: string | null;
  predictedJobId: string | null;
  txHashes: string[];
  prompt: string | null;
  fundableUntil: number | null;
  token: string;
  amountRaw: string;
}

/**
 * How a device treats an open record: its own (`own`), another device's with
 * chain evidence that the wallet acted (`block` — it may still pay), another
 * device's with no evidence yet (`warn` — the buyer may confirm past it), or
 * none (`clear`).
 */
export function remoteDecision(open: PublicAttempt | null, ownPublicId: string | null): 'clear' | 'own' | 'block' | 'warn' {
  if (!open) return 'clear';
  if (ownPublicId && open.publicId === ownPublicId) return 'own';
  return open.verified ? 'block' : 'warn';
}

/*
 * The buyer's "I've checked; continue" for one record, kept in this browser.
 * It lived in page memory only, so a reload or a crash forgot it and the
 * same warning came back for a record the buyer had already checked.
 *
 * Keyed by the record's public id: a different record, or the same one
 * once the chain shows it acted (it then blocks, whatever was confirmed),
 * is never covered by an earlier confirmation. Storage that cannot be used
 * falls back to this page's memory, which is what it was before.
 */
const ACK_PREFIX = 'pokter:remote-attempt-checked:';
const ackMemory = new Map<string, string>();
const ackKey = (wallet: string, chainId: number) => `${ACK_PREFIX}${wallet.toLowerCase()}:${chainId}`;

export function acknowledgedAttempt(wallet: string, chainId: number): string | null {
  const key = ackKey(wallet, chainId);
  try {
    return window.localStorage.getItem(key) ?? ackMemory.get(key) ?? null;
  } catch {
    return ackMemory.get(key) ?? null;
  }
}

export function acknowledgeAttempt(wallet: string, chainId: number, publicId: string): void {
  const key = ackKey(wallet, chainId);
  ackMemory.set(key, publicId);
  try {
    window.localStorage.setItem(key, publicId);
  } catch {
    /* Kept in memory for this page. */
  }
}

/**
 * Whether a recheck found the record as the buyer last saw it: the same
 * record, still without chain evidence and with nothing recorded since.
 * Anything else is news, and a confirmation given before it does not stand.
 */
export function attemptUnchanged(before: PublicAttempt, now: PublicAttempt): boolean {
  return now.publicId === before.publicId && !now.verified && now.jobId === before.jobId && now.txHashes.length === before.txHashes.length && now.prompt === before.prompt;
}

/** The wallet's open record, or null; `unavailable` when the server could not be asked. */
export async function fetchOpenAttempt(wallet: string, chainId: number): Promise<PublicAttempt | null | 'unavailable'> {
  try {
    const response = await fetch(`/api/hire/attempts?wallet=${wallet}&chainId=${chainId}`, { cache: 'no-store' });
    if (!response.ok) return 'unavailable';
    return ((await response.json()) as { open: PublicAttempt | null }).open;
  } catch {
    return 'unavailable';
  }
}

const post = async (body: Record<string, unknown>) => {
  try {
    const response = await fetch('/api/hire/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return { status: 0, body: null };
  }
};

/** Mirror one attempt to the server. `begin` reports a conflict (another device began first); the rest never throw. */
export function remoteAttempt(wallet: string, chainId: number, secret: string) {
  const base = { wallet, chainId, secret };
  return {
    async begin(init: { provider: string; description: string; token: string; amountRaw: string; predictedJobId?: string | null; fundableUntil?: number | null }): Promise<{ ok: true; publicId: string | null } | { ok: false; open: PublicAttempt | null }> {
      const r = await post({ ...base, action: 'begin', ...init });
      if (r.status === 409) return { ok: false, open: (r.body?.open as PublicAttempt | null) ?? null };
      return { ok: true, publicId: typeof r.body?.publicId === 'string' ? r.body.publicId : null };
    },
    update(patch: { txHashes?: string[]; jobId?: string; predictedJobId?: string; callsId?: string; prompt?: string; fundableUntil?: number }) {
      void post({ ...base, action: 'update', ...patch });
    },
    close(reason: 'funded' | 'nothing-sent') {
      void post({ ...base, action: 'close', reason });
    },
  };
}
