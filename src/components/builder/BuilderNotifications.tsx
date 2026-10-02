'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';

type BuilderAlert = {
  id: string; jobId: string; agentName: string; event: string;
  title: string; body: string; createdAt: string; readAt: string | null;
};
type Inbox = { items: BuilderAlert[]; unread: number };
type EmailStatus = { configured: boolean; verified: boolean; emailMasked: string | null };

async function readInbox(): Promise<Inbox> {
  const response = await fetch('/api/builders/notifications', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Builder alerts could not be loaded.');
  return response.json() as Promise<Inbox>;
}

async function readEmailStatus(): Promise<EmailStatus> {
  const response = await fetch('/api/builders/notifications/email', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Email alert settings could not be loaded.');
  return response.json() as Promise<EmailStatus>;
}

export function BuilderNotifications() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sending, setSending] = useState(false);
  const inbox = useQuery({ queryKey: ['builder-notifications'], queryFn: readInbox, refetchInterval: 60_000 });
  const emailStatus = useQuery({ queryKey: ['builder-email-status'], queryFn: readEmailStatus });
  const unread = inbox.data?.unread ?? 0;

  async function markRead(id?: string) {
    await fetch('/api/builders/notifications', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(id ? { id } : {}),
    });
    await queryClient.invalidateQueries({ queryKey: ['builder-notifications'] });
  }

  async function subscribeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setEmailMessage('');
    try {
      const response = await fetch('/api/builders/notifications/email', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Could not start email verification.');
      setEmail('');
      setEmailMessage('Check your inbox and confirm the link to activate alerts.');
      await queryClient.invalidateQueries({ queryKey: ['builder-email-status'] });
    } catch (error) {
      setEmailMessage((error as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5" aria-labelledby="builder-alerts-heading">
      <div className="flex items-start justify-between gap-3"><div><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Notifications</p><h2 id="builder-alerts-heading" className="mt-2 text-base font-semibold">Builder alerts</h2></div>{unread > 0 && <button type="button" onClick={() => markRead()} className="text-[9px] font-medium text-[color:var(--brand-strong)]">Mark all read</button>}</div>
      {inbox.isPending ? <p className="py-6 text-center text-[10px] text-[color:var(--text-muted)]">Checking onchain job updates…</p> : inbox.isError ? <p className="mt-4 rounded-[var(--radius)] bg-[color:var(--caution-dim)] p-3 text-[10px] text-[color:var(--caution)]">Alerts are temporarily unavailable. Your job state remains onchain.</p> : (
        <div className="mt-4 flex flex-col gap-2">{inbox.data?.items.slice(0, 5).map((item) => <button type="button" key={item.id} onClick={() => !item.readAt && markRead(item.id)} className={`rounded-[var(--radius)] border p-3 text-left transition-colors ${item.readAt ? 'border-transparent bg-[color:var(--bg-subtle)]' : 'border-[color:var(--brand)]/30 bg-[color:var(--brand-dim)]'}`}><div className="flex items-start gap-2"><span className={`mt-1 size-1.5 shrink-0 rounded-full ${item.readAt ? 'bg-[color:var(--neutral)]' : 'bg-[color:var(--brand)]'}`} /><div><p className="text-[10px] font-semibold">{item.title}</p><p className="mt-1 text-[9px] leading-4 text-[color:var(--text-muted)]">{item.body}</p></div></div></button>)}{!inbox.data?.items.length && <p className="py-5 text-center text-[12px] leading-4 text-[color:var(--text-muted)]">No builder alerts yet. Funded commissions and verified status changes appear here.</p>}</div>
      )}
      <div className="mt-4 border-t border-[color:var(--border)] pt-4">
        {emailStatus.data?.verified ? (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] bg-[color:var(--positive-dim)] px-3 py-2.5"><div><p className="text-[10px] font-semibold text-[color:var(--positive)]">Email alerts active</p><p className="mt-0.5 text-[8px] text-[color:var(--text-muted)]">Sending to {emailStatus.data.emailMasked}</p></div><span className="text-[color:var(--positive)]" aria-hidden="true">✓</span></div>
        ) : (
          <form onSubmit={subscribeEmail} className="space-y-2">
            <label htmlFor="builder-alert-email" className="block text-[10px] font-semibold">Get important job updates by email</label>
            <div className="flex gap-2"><input id="builder-alert-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="min-w-0 flex-1 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 py-2 text-[10px] outline-none focus:border-[color:var(--brand)]" /><button type="submit" disabled={sending} className="rounded-[var(--radius)] bg-[color:var(--text)] px-3 py-2 text-[9px] font-semibold text-[color:var(--bg)] disabled:opacity-50">{sending ? 'Sending…' : 'Notify me'}</button></div>
            {emailStatus.data?.configured && !emailMessage && <p className="text-[8px] text-[color:var(--caution)]">Confirmation is pending for {emailStatus.data.emailMasked}.</p>}
            {emailMessage && <p role="status" className="text-[8px] leading-4 text-[color:var(--text-muted)]">{emailMessage}</p>}
          </form>
        )}
      </div>
      <p className="mt-3 text-[8px] leading-4 text-[color:var(--text-faint)]">Opt-in alerts are deduplicated from chain-verified job states, exclude task content, and never change escrow.</p>
    </section>
  );
}
