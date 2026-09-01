import { listSessions } from '@/lib/altana/session';
import { listJobs } from '@/lib/erc8183/hire';
import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
import { SessionCard } from '@/components/jobs/SessionCard';
import { JobCard } from '@/components/jobs/JobCard';

export const dynamic = 'force-dynamic';

/**
 * §56. What you have delegated, and what you have commissioned.
 *
 * Two different kinds of authority, kept visually distinct: a session is
 * standing permission to act on your wallet, while a job is a funded, escrowed
 * piece of work. Conflating them would hide the fact that revoking a session
 * does not cancel a job already in escrow.
 */
export default async function MyAgentsPage() {
  const explorerBase = ALTANA_NETWORK.explorer.replace(/\/$/, '');
  const sessions = listSessions();
  const jobs = listJobs();

  const activeSessions = sessions.filter(
    (s) => !s.revokedAt && Date.parse(s.expiresAt) > Date.now(),
  ).length;

  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Your agents
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          {activeSessions} active permission{activeSessions === 1 ? '' : 's'} ·{' '}
          {jobs.length} commissioned job{jobs.length === 1 ? '' : 's'}
          {IS_TESTNET && ' · BSC testnet'}
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4 border-b border-[color:var(--border)] pb-3">
          <h2 className="text-base font-medium tracking-tight">Permissions</h2>
          <p className="text-[11px] text-[color:var(--text-faint)]">
            Standing authority to act on your wallet
          </p>
        </div>

        {sessions.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6 text-center text-xs text-[color:var(--text-faint)]">
            You have not granted any agent permission yet. Permissions are
            scoped, capped and expiring — and revocable here at any time.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                explorerBase={explorerBase}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4 border-b border-[color:var(--border)] pb-3">
          <h2 className="text-base font-medium tracking-tight">Jobs</h2>
          <p className="text-[11px] text-[color:var(--text-faint)]">
            Escrowed work commissioned over ERC-8183
          </p>
        </div>

        {jobs.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6 text-center text-xs text-[color:var(--text-faint)]">
            No jobs commissioned yet. Hiring escrows $U on the AgenticCommerce
            kernel and releases it only after the agent delivers.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} explorerBase={explorerBase} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
