'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { SessionCard } from '@/components/jobs/SessionCard';
import { JobCard } from '@/components/jobs/JobCard';
import {
  noSessions,
  jobsForWallet,
  noJobs,
  rememberJob,
  sessionsForWallet,
  subscribeToJobs,
  subscribeToSessions,
} from '@/lib/wallet/activity';
import { WALLET_NETWORK } from '@/lib/wallet/passkey';
import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';
import {
  getErc8183DeliverableUrl,
  getErc8183Job,
} from '@altananetwork/sdk';
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
  const {
    wallet,
    ready,
    supported,
    busy,
    error: walletError,
    create,
    recover,
  } = usePasskeyWallet();
  const [importId, setImportId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
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

  const importJob = async () => {
    if (!wallet || !/^\d+$/.test(importId)) {
      setImportError('Enter a numeric ERC-8183 job ID.');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const jobId = BigInt(importId);
      const onchain = await getErc8183Job(WALLET_NETWORK, jobId);
      if (onchain.client.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error('This passkey wallet is not the client for that job.');
      }
      const envelope = decodePokterJobEnvelope(onchain.description);
      if (
        envelope &&
        envelope.provider.toLowerCase() !== onchain.provider.toLowerCase()
      ) {
        throw new Error('The committed provider does not match the escrow job.');
      }
      const deliverableUrl =
        onchain.statusName === 'SUBMITTED' ||
        onchain.statusName === 'COMPLETED'
          ? (await getErc8183DeliverableUrl(WALLET_NETWORK, jobId).catch(
              () => undefined,
            )) ?? null
          : null;
      const now = new Date().toISOString();
      const recovered: HiredJob = {
        id: `${WALLET_NETWORK.chainId}:${importId}`,
        jobId: importId,
        chainId: WALLET_NETWORK.chainId,
        isTestnet: WALLET_NETWORK.chainId === 97,
        agentTokenId: envelope?.identity.tokenId ?? 'unknown',
        agentName: envelope
          ? `ERC-8004 agent #${envelope.identity.tokenId}`
          : `Recovered job #${importId}`,
        provider: onchain.provider,
        task: envelope?.task ?? onchain.description,
        budgetRaw: onchain.budget.toString(),
        expiredAt: new Date(Number(onchain.expiredAt) * 1000).toISOString(),
        hiredAt: now,
        hireTxHash: null,
        status: onchain.statusName as JobStatusName,
        statusCheckedAt: now,
        deliverableUrl,
        settleTxHash: null,
        disputeTxHash: null,
      };
      rememberJob(wallet.address, recovered);
      setImportId('');
    } catch (error) {
      setImportError((error as Error).message);
    } finally {
      setImporting(false);
    }
  };

  if (!wallet) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Connect your signing wallet</h3>
          <p className="max-w-xl text-xs leading-relaxed text-[color:var(--text-faint)]">
            Use the passkey wallet that created your sessions. Activity is read
            from this device only and is never taken from another visitor&apos;s
            server data.
          </p>
        </div>
        {!ready ? (
          <p className="text-xs text-[color:var(--text-faint)]">Checking this device…</p>
        ) : !supported ? (
          <p className="text-xs text-[color:var(--caution)]">
            Passkeys require a supported browser over a secure connection.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={recover}
              className="action-primary rounded-[var(--radius)] px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              {busy === 'recovering' ? 'Waiting for passkey…' : 'Use existing passkey'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={create}
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
            >
              {busy === 'creating' ? 'Waiting for passkey…' : 'Create passkey wallet'}
            </button>
          </div>
        )}
        {walletError && (
          <p className="text-xs leading-relaxed text-[color:var(--negative)]">
            {walletError}
          </p>
        )}
      </div>
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

        <div className="flex max-w-xl flex-col gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <h4 className="text-sm font-medium">Recover an on-chain job</h4>
          <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            Enter its ERC-8183 job ID. Pokter will import it only when the
            connected passkey wallet is the job&apos;s on-chain client.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={importId}
              onChange={(event) => setImportId(event.target.value.trim())}
              placeholder="Job ID"
              aria-label="ERC-8183 job ID"
              className="mono w-36 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 py-2 text-[12px]"
            />
            <button
              type="button"
              onClick={importJob}
              disabled={importing || !/^\d+$/.test(importId)}
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-2 text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
            >
              {importing ? 'Reading chain…' : 'Import job'}
            </button>
          </div>
          {importError && (
            <p className="text-[11px] leading-relaxed text-[color:var(--negative)]">
              {importError}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
