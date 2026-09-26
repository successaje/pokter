'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { SessionCard } from '@/components/jobs/SessionCard';
import { JobCard } from '@/components/jobs/JobCard';
import {
  noSessions,
  jobsForWallet,
  noJobs,
  sessionsForWallet,
  subscribeToJobs,
  subscribeToSessions,
} from '@/lib/wallet/activity';
import type { SessionView, SessionState } from '@/lib/altana/session';
import type { GrantedSession } from '@/lib/altana/types';

function currentState(session: SessionView): SessionState {
  if (session.revokedAt) return 'revoked';
  return Date.parse(session.expiresAt) <= Date.now() ? 'expired' : 'active';
}

function toView(stored: GrantedSession[]): SessionView[] {
  const now = Date.now();
  return stored.map((session) => {
    const view = {
      ...session,
      state: 'active' as SessionState,
      remainingMs: Math.max(0, Date.parse(session.expiresAt) - now),
    };
    return { ...view, state: currentState(view) };
  });
}

export function PrivateActivity({ explorerBase }: { explorerBase: string }) {
  const { wallet } = usePasskeyWallet();
  const getSnapshot = useCallback(
    () => (wallet ? sessionsForWallet(wallet.address) : noSessions()),
    [wallet],
  );
  const stored = useSyncExternalStore(subscribeToSessions, getSnapshot, noSessions);
  const sessions = toView(stored);
  const getJobsSnapshot = useCallback(
    () => (wallet ? jobsForWallet(wallet.address) : noJobs()),
    [wallet],
  );
  const jobs = useSyncExternalStore(subscribeToJobs, getJobsSnapshot, noJobs);

  if (!wallet) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6 text-center text-xs leading-relaxed text-[color:var(--text-faint)]">
        Connect the passkey wallet that created your sessions. Activity is read
        from this device only and is never taken from another visitor&apos;s server data.
      </p>
    );
  }

  if (sessions.length === 0 && jobs.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6 text-center text-xs leading-relaxed text-[color:var(--text-faint)]">
        This passkey wallet has no sessions or jobs recorded on this device yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
          Permissions
        </h3>
        {sessions.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} explorerBase={explorerBase} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-[color:var(--text-faint)]">No device-local sessions.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
          Escrowed jobs
        </h3>
        {jobs.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} explorerBase={explorerBase} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-[color:var(--text-faint)]">No device-local jobs.</p>
        )}
      </section>
    </div>
  );
}
