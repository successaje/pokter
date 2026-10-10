'use client';

import { useEffect } from 'react';
import { applySavedAgentSnapshots, readSavedAgents, subscribeToSavedAgents, type SavedAgentSnapshot } from '@/lib/wallet/saved-agents';

const CHECK_KEY = 'pokter.saved-agents.last-check.v1';
const CHECK_EVERY_MS = 15 * 60_000;

export function SavedAgentMonitor() {
  useEffect(() => {
    const check = async () => {
      const agents = readSavedAgents();
      if (!agents.length) return;
      const fingerprint = agents.map(({ chainId, tokenId }) => `${chainId}:${tokenId}`).sort().join(',');
      let last: { at: number; fingerprint: string } = { at: 0, fingerprint: '' };
      try {
        const stored = JSON.parse(window.localStorage.getItem(CHECK_KEY) ?? '{}') as Partial<typeof last>;
        last = { at: Number(stored.at) || 0, fingerprint: String(stored.fingerprint ?? '') };
      } catch { /* An old or malformed value should trigger a fresh check. */ }
      if (last.fingerprint === fingerprint && Date.now() - last.at < CHECK_EVERY_MS) return;
      try {
        const response = await fetch('/api/saved/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agents: agents.map(({ chainId, tokenId }) => ({ chainId, tokenId })) }) });
        if (!response.ok) return;
        const payload = (await response.json()) as { snapshots?: SavedAgentSnapshot[] };
        window.localStorage.setItem(CHECK_KEY, JSON.stringify({ at: Date.now(), fingerprint }));
        if (payload.snapshots) applySavedAgentSnapshots(payload.snapshots);
      } catch { /* The next visit retries; monitoring never blocks navigation. */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const unsubscribe = subscribeToSavedAgents(() => void check());
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, []);
  return null;
}
