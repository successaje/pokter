'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import {
  draftProgress,
  draftTitle,
  draftsServerSnapshot,
  draftsSnapshot,
  subscribeToDrafts,
} from '@/lib/builder/drafts';
import { chainLabel } from '@/lib/network/presentation';

interface OwnedAgent {
  chainId: number;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
  declaresProtocol: boolean;
}

/**
 * What a builder has here: agents they published, and drafts they have not.
 *
 * Shown to whoever is connected rather than behind ownership verification.
 * Who owns an identity is public and printed on every agent page, so
 * reading the list proves nothing a stranger could not already learn —
 * and gating it meant a passkey holder, who cannot produce that proof at
 * all, could not see their own published work. Signing is still what any
 * action needs.
 */
export function BuilderSection({ address }: { address: string | null }) {
  /*
   * Drafts live in this browser, so they are subscribed to rather than
   * copied into state on mount: an effect that assigns state is the
   * pattern the linter rejects, the server snapshot is simply empty, and
   * discarding a draft in one tab updates this list in another.
   */
  const drafts = useSyncExternalStore(
    subscribeToDrafts,
    draftsSnapshot,
    draftsServerSnapshot,
  );

  const owned = useQuery<{ agents: OwnedAgent[] }>({
    queryKey: ['owned-agents', address],
    enabled: Boolean(address),
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(`/api/builders/agents?address=${address}`);
      if (!response.ok) throw new Error('Could not read your agents.');
      return response.json() as Promise<{ agents: OwnedAgent[] }>;
    },
  });

  const agents = owned.data?.agents ?? [];
  const nothingYet = !owned.isLoading && agents.length === 0 && drafts.length === 0;

  return (
    <section aria-labelledby="builder-heading" className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">
            Building
          </p>
          <h2 id="builder-heading" className="mt-2 text-xl font-semibold">
            Agents you publish
          </h2>
        </div>
        <Link
          href="/build"
          className="action-primary shrink-0 rounded-[var(--radius)] px-4 py-2.5 text-[12px] font-semibold"
        >
          Create an agent
        </Link>
      </div>

      {nothingYet && (
        <p className="mt-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5 text-[12px] leading-5 text-[color:var(--text-secondary)]">
          Nothing published from this wallet yet. An agent earns its record by
          answering when Pokter calls it, so the useful first step is a
          reachable endpoint rather than a finished product.
        </p>
      )}

      {owned.isLoading && address && (
        <p className="mt-4 text-[12px] text-[color:var(--text-muted)]">
          Reading the registry…
        </p>
      )}

      {agents.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {agents.map((agent) => (
            <li key={`${agent.chainId}:${agent.tokenId}`}>
              <Link
                href={`/agents/${agent.chainId}/${agent.tokenId}`}
                className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 transition-colors hover:border-[color:var(--border-strong)]"
              >
                <AgentAvatar name={agent.name} src={agent.imageUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{agent.name}</span>
                  <span className="block truncate text-[10px] text-[color:var(--text-muted)]">
                    {agent.category ?? 'Unclassified'} · {chainLabel(agent.chainId)}
                    {!agent.declaresProtocol && ' · no endpoint declared'}
                  </span>
                </span>
                <span aria-hidden className="text-[color:var(--text-faint)]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {drafts.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-medium text-[color:var(--text-secondary)]">
            {drafts.length === 1 ? 'One draft, not yet published' : `${drafts.length} drafts, not yet published`}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {drafts.map((entry) => {
              const progress = draftProgress(entry.draft);
              return (
                <li key={entry.id}>
                  <Link
                    href="/build"
                    className="flex items-center gap-3 rounded-[var(--radius)] border border-dashed border-[color:var(--border)] px-3 py-2.5 transition-colors hover:border-[color:var(--border-strong)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px]">{draftTitle(entry.draft)}</span>
                      <span className="block text-[10px] text-[color:var(--text-muted)]">
                        {progress.done} of {progress.total} filled in · saved on this device
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-[color:var(--brand-strong)]">
                      Continue →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
