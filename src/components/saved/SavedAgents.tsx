'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { SaveAgentButton } from '@/components/agent/SaveAgentButton';
import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { markSavedAgentAlertsRead, readSavedAgentAlerts, readSavedAgents, subscribeToSavedAgents, type SavedAgent, type SavedAgentAlert } from '@/lib/wallet/saved-agents';

export function SavedAgents() {
  const [agents, setAgents] = useState<SavedAgent[]>([]);
  const [ready, setReady] = useState(false);
  const [alerts, setAlerts] = useState<SavedAgentAlert[]>([]);

  useEffect(() => {
    const refresh = () => { setAgents(readSavedAgents()); setAlerts(readSavedAgentAlerts()); setReady(true); };
    refresh();
    return subscribeToSavedAgents(refresh);
  }, []);

  if (!ready) return <div className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-[color:var(--surface)]" />;
  if (!agents.length) {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] px-6 py-14 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand)]"><svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-none stroke-current" strokeWidth="1.8"><path d="M12 20.5 4.8 13.8A5.2 5.2 0 0 1 12 6.3a5.2 5.2 0 0 1 7.2 7.5L12 20.5Z" /></svg></span>
        <h2 className="mt-4 text-base font-semibold">Save agents for later</h2>
        <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-[color:var(--text-muted)]">Use the heart on any agent card to build a shortlist before comparing or commissioning.</p>
        <Link href="/agents" className="action-primary mt-5 rounded-[var(--radius)] px-4 py-2.5 text-[12px] font-medium">Browse agents</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {alerts.some((alert) => !alert.readAt) && (
        <section className="rounded-[var(--radius-lg)] border border-[color:var(--brand)]/30 bg-[color:var(--brand-highlight-soft)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Saved-agent updates</h2>
            <button type="button" onClick={markSavedAgentAlertsRead} className="text-[10px] underline decoration-dotted">Mark all read</button>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {alerts.filter((alert) => !alert.readAt).slice(0, 8).map((alert) => <li key={alert.id} className="text-[12px] leading-relaxed"><strong>{alert.title}</strong><span className="text-[color:var(--text-muted)]"> · {alert.body}</span></li>)}
          </ul>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => {
        const category = CATEGORY_BY_ID.get(agent.category as Category)?.label ?? agent.category;
        return (
          <article key={`${agent.chainId}:${agent.tokenId}`} className="surface-card relative flex min-w-0 flex-col p-4">
            <SaveAgentButton agent={agent} compact className="absolute right-3 top-3" />
            <Link href={`/agents/${agent.chainId}/${agent.tokenId}`} className="flex min-w-0 flex-1 flex-col pr-10">
              <div className="flex min-w-0 items-start gap-3">
                <AgentAvatar name={agent.name} src={agent.imageUrl} size="sm" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">{category}</p>
                  <h2 className="mt-1 line-clamp-2 break-words text-sm font-medium leading-snug [overflow-wrap:anywhere]">{agent.name}</h2>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 break-words text-[12px] leading-relaxed text-[color:var(--text-muted)] [overflow-wrap:anywhere]">{agent.description}</p>
              <span className="mt-4 text-[11px] font-medium text-[color:var(--info)]">View evidence →</span>
            </Link>
          </article>
        );
      })}
      </div>
    </div>
  );
}
