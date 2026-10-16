'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSignMessage } from 'wagmi';

import { jobHref } from '@/lib/jobs/href';
import type { IdentityState } from '@/lib/notifications/identity';
import { describeAddressChange, type AddressChangeChoice } from '@/lib/notifications/preferences';
import { isEscrowChain } from '@/lib/network/escrow';
import { CHAIN_ID, chainLabel } from '@/lib/network/presentation';
import { useActiveWallet } from '@/lib/wallet/active';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Field, Input } from '@/ui/Field';
import { Segmented } from '@/ui/Controls';

interface IdentityView {
  state: IdentityState;
  email: string | null;
  sendingTo: string | null;
  jobs: { jobId: string; includeAnswer: boolean }[];
}

/**
 * One email address per wallet, proven by the wallet, and the jobs it is
 * sending about.
 *
 * Replaces a form that asked for an address per job and emailed a
 * confirmation link each time. The address is proven once: the wallet signs
 * for it, the inbox confirms it, and from then on any job is one click from
 * its own page.
 *
 * Three things this surface has to get right, because each of them is a way
 * to quietly widen what somebody agreed to:
 *
 * - A proven address is **not** a subscription. This page lists exactly the
 *   jobs that are sending, and offers no "all my jobs" switch.
 * - Changing an address **asks** what happens to work already running.
 *   Moving a live escrow's mail to a new inbox is a disclosure nobody asked
 *   for; dropping it loses the delivery notice on work already paid for.
 * - Until the new inbox confirms, mail keeps going to the old address, and
 *   this says so rather than showing the new one as if it were live.
 */
export function NotificationEmail({ address }: { address: string }) {
  const { chain } = useAccount();
  const { mode } = useActiveWallet();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const chainId = chain && isEscrowChain(chain.id) ? chain.id : CHAIN_ID;

  const [email, setEmail] = useState('');
  const [choice, setChoice] = useState<AddressChangeChoice>('move');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const key = ['notification-identity', address, chainId] as const;
  const identity = useQuery({
    queryKey: key,
    staleTime: 15_000,
    queryFn: async (): Promise<IdentityView> => {
      const response = await fetch(`/api/notifications/identity?wallet=${address}&chainId=${chainId}`);
      if (!response.ok) throw new Error('The notification settings could not be read.');
      return (await response.json()) as IdentityView;
    },
  });

  const post = async (path: string, body: unknown) => {
    const response = await fetch(`/api/notifications/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'That did not go through. Try again.');
    return payload;
  };

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (caught) {
      const message = (caught as Error).message || 'That did not go through.';
      setError(/reject|denied|cancel/i.test(message) ? 'Cancelled in the wallet. Nothing changed.' : message);
    } finally {
      setBusy(null);
    }
  };

  /** Issue a challenge, sign it, redeem it. The shape every act here uses. */
  const signed = async (path: string, action: string, challengeAction: string, extra: Record<string, unknown> = {}) => {
    const issued = await post(path, { action: challengeAction, wallet: address, chainId, ...extra });
    const challenge = issued.challenge as { challengeId: string; message: string };
    const signature = await signMessageAsync({ message: challenge.message });
    return post(path, { action, wallet: address, chainId, ...extra, challengeId: challenge.challengeId, signature });
  };

  const claim = () => run('claim', async () => {
    const result = await signed('identity', 'claim', 'challenge', {
      email: email.trim().toLowerCase(),
      runningJobs: choice,
    });
    setSentTo(String(result.email ?? email.trim()));
    setEmail('');
  });

  const view = identity.data;
  const canSign = mode === 'external';

  if (!canSign && !view?.sendingTo) {
    return (
      <Notice tone="neutral" title="Proving an address needs a browser wallet">
        A passkey wallet cannot sign a plain message yet, so it cannot prove an email address. Each job page still takes an
        address directly, and those emails work the same way.
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">The address this wallet uses for job updates</p>
        <p className="text-[12.5px] text-ink-3">
          Proven once, on {chainLabel(chainId)}. A proof covers one network, because the same address can be a different
          account on each. It is not a subscription: every job is still opted into from its own page.
        </p>
      </div>

      {view && <Status view={view} />}

      {view?.sendingTo && view.jobs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-rule p-4">
          <p className="text-sm font-medium">Sending about {view.jobs.length === 1 ? '1 job' : `${view.jobs.length} jobs`}</p>
          <ul className="flex flex-col divide-y divide-rule">
            {view.jobs.map((job) => (
              <li key={job.jobId} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                <span>
                  <a className="font-medium underline-offset-2 hover:underline" href={jobHref({ jobId: job.jobId, chainId })}>
                    Job #{job.jobId}
                  </a>
                  <span className="text-ink-3">{job.includeAnswer ? ' · full answer' : ' · answer preview'}</span>
                </span>
                <Button
                  type="button" intent="ghost" size="s"
                  busy={busy === `stop-${job.jobId}`} disabled={Boolean(busy) || !canSign}
                  onClick={() => void run(`stop-${job.jobId}`, async () => {
                    await signed('job-updates', 'off', 'challenge-off', { jobId: job.jobId });
                  })}
                >
                  Stop
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] text-ink-3">
            Stopping is signed, because a silenced delivery email is how a review window gets missed. Every one of these
            emails also carries its own unsubscribe link.
          </p>
        </div>
      )}

      {sentTo ? (
        <Notice tone="ok" title="Confirm the link we sent">
          Sent to <strong className="font-medium">{sentTo}</strong>. Until it is confirmed, nothing is sent there
          {view?.sendingTo ? ` and updates keep going to ${view.sendingTo}` : ''}.
        </Notice>
      ) : (
        <div className="flex flex-col gap-3 rounded-[12px] border border-rule p-4">
          <p className="text-sm font-medium">{view?.sendingTo ? 'Use a different address' : 'Add an address'}</p>
          <Field label="Email">
            {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
          </Field>
          {view?.sendingTo && view.jobs.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium">Jobs already sending updates</span>
              <Segmented
                label="Jobs already sending updates"
                value={choice}
                onChange={setChoice}
                options={[
                  { value: 'move', label: 'Carry them over' },
                  { value: 'stop', label: 'Stop them' },
                ]}
              />
              <p className="text-[12.5px] text-ink-3">{describeAddressChange(choice, view.jobs.length)}</p>
            </div>
          )}
          <Button
            type="button" intent="secondary" className="self-start"
            busy={busy === 'claim'} disabled={Boolean(busy) || !email.trim() || !canSign}
            onClick={() => void claim()}
          >
            Sign and confirm
          </Button>
          <p className="text-[12.5px] text-ink-3">
            Two steps, both needed: the wallet signs for the address, then the address confirms a link. A signature is not
            a transaction and moves nothing.
          </p>
        </div>
      )}

      {view?.sendingTo && (
        <Button
          type="button" intent="ghost" size="s" className="self-start"
          busy={busy === 'remove'} disabled={Boolean(busy) || !canSign}
          onClick={() => void run('remove', async () => {
            await signed('identity', 'remove', 'challenge-remove');
            setSentTo(null);
          })}
        >
          Remove this address
        </Button>
      )}

      {error && <Notice tone="watch">{error}</Notice>}
    </div>
  );
}

/** What is true right now, in one sentence, with no state left unnamed. */
function Status({ view }: { view: IdentityView }) {
  if (view.state === 'replacing') {
    return (
      <Notice tone="watch" title="A new address is waiting to be confirmed">
        Updates are still going to <strong className="font-medium">{view.sendingTo}</strong>. They move to{' '}
        <strong className="font-medium">{view.email}</strong> when its link is confirmed, and not before.
      </Notice>
    );
  }
  if (view.state === 'pending-email') {
    return (
      <Notice tone="watch" title="Not confirmed yet">
        <strong className="font-medium">{view.email}</strong> has been signed for, but nothing is sent there until its
        link is confirmed.
      </Notice>
    );
  }
  if (view.state === 'pending-signature') {
    return <Notice tone="watch" title="Not signed for yet">Sign for {view.email} to finish adding it.</Notice>;
  }
  if (view.state === 'ready') {
    return (
      <Notice tone="ok" title={`Confirmed: ${view.email}`}>
        {view.jobs.length === 0
          ? 'No job is sending updates. Each one takes a single click, from its own page.'
          : 'Listed below are the jobs it is sending about, and nothing else.'}
      </Notice>
    );
  }
  return <p className="text-[13px] text-ink-3">No address yet.</p>;
}
