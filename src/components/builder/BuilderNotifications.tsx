'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

type BuilderAlert = {
  id: string; jobId: string; agentName: string; event: string;
  title: string; body: string; createdAt: string; readAt: string | null;
};
type Inbox = { items: BuilderAlert[]; unread: number };

async function readInbox(): Promise<Inbox> {
  const response = await fetch('/api/builders/notifications', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Builder alerts could not be loaded.');
  return response.json() as Promise<Inbox>;
}

export function BuilderNotifications() {
  const queryClient = useQueryClient();
  const inbox = useQuery({ queryKey: ['builder-notifications'], queryFn: readInbox, refetchInterval: 60_000 });
  const unread = inbox.data?.unread ?? 0;

  async function markRead(id?: string) {
    await fetch('/api/builders/notifications', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(id ? { id } : {}),
    });
    await queryClient.invalidateQueries({ queryKey: ['builder-notifications'] });
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5" aria-labelledby="builder-alerts-heading">
      <div className="flex items-start justify-between gap-3"><div><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Notifications</p><h2 id="builder-alerts-heading" className="mt-2 text-base font-semibold">Builder alerts</h2></div>{unread > 0 && <button type="button" onClick={() => markRead()} className="text-[9px] font-medium text-[color:var(--brand-strong)]">Mark all read</button>}</div>
      {inbox.isPending ? <p className="py-6 text-center text-[10px] text-[color:var(--text-muted)]">Checking onchain job updates…</p> : inbox.isError ? <p className="mt-4 rounded-[var(--radius)] bg-[color:var(--caution-dim)] p-3 text-[10px] text-[color:var(--caution)]">Alerts are temporarily unavailable. Your job state remains onchain.</p> : (
        <div className="mt-4 flex flex-col gap-2">{inbox.data?.items.slice(0, 5).map((item) => <button type="button" key={item.id} onClick={() => !item.readAt && markRead(item.id)} className={`rounded-[var(--radius)] border p-3 text-left transition-colors ${item.readAt ? 'border-transparent bg-[color:var(--bg-subtle)]' : 'border-[color:var(--brand)]/30 bg-[color:var(--brand-dim)]'}`}><div className="flex items-start gap-2"><span className={`mt-1 size-1.5 shrink-0 rounded-full ${item.readAt ? 'bg-[color:var(--neutral)]' : 'bg-[color:var(--brand)]'}`} /><div><p className="text-[10px] font-semibold">{item.title}</p><p className="mt-1 text-[9px] leading-4 text-[color:var(--text-muted)]">{item.body}</p></div></div></button>)}{!inbox.data?.items.length && <p className="py-5 text-center text-[10px] leading-4 text-[color:var(--text-muted)]">No builder alerts yet. Funded commissions and verified status changes appear here.</p>}</div>
      )}
      <p className="mt-4 border-t border-[color:var(--border)] pt-3 text-[8px] leading-4 text-[color:var(--text-faint)]">Alerts are deduplicated from chain-verified job states. They never change escrow.</p>
    </section>
  );
}
