'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSignMessage } from 'wagmi';

import type { JobUpdateOffer } from '@/lib/notifications/job-updates';
import { useActiveWallet } from '@/lib/wallet/active';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { JobEmailAlert } from './JobEmailAlert';

/**
 * "Get updates for this job", for a buyer who has already proven an email.
 *
 * Before this, every job asked for the address again and emailed another
 * confirmation link. Four hires meant four identical forms and four emails
 * to the same inbox, which is both tedious and a way to teach people that
 * clicking links from Pokter is routine.
 *
 * The address is never in the request: the server reads it from the
 * wallet's own proven identity. One click, no typing, and no second
 * confirmation — the inbox already gave one.
 *
 * Stopping costs a signature, because a silenced delivery email is how a
 * buyer misses their review window. The wallet signs text that names the
 * job it is silencing; the emails also keep their own unsubscribe link,
 * which proves the inbox instead.
 */
export function JobUpdates({ jobId, chainId, className, compact = false }: {
  jobId: string; chainId: number; className?: string; compact?: boolean;
}) {
  const { address, mode } = useActiveWallet();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [includeAnswer, setIncludeAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = ['job-updates', chainId, jobId, address] as const;
  const offer = useQuery({
    queryKey: key,
    enabled: Boolean(address),
    staleTime: 30_000,
    queryFn: async (): Promise<JobUpdateOffer> => {
      const response = await fetch(`/api/notifications/job-updates?wallet=${address}&chainId=${chainId}&jobId=${jobId}`);
      if (!response.ok) throw new Error('The update settings could not be read.');
      return ((await response.json()) as { offer: JobUpdateOffer }).offer;
    },
  });

  if (!address) return null;

  const act = async (run: () => Promise<Response>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await run();
      const payload = (await response.json().catch(() => ({}))) as { error?: string; offer?: JobUpdateOffer };
      if (!response.ok) throw new Error(payload.error ?? 'That did not go through. Try again.');
      if (payload.offer) queryClient.setQueryData(key, payload.offer);
    } catch (caught) {
      const message = (caught as Error).message || 'That did not go through.';
      setError(/reject|denied|cancel/i.test(message) ? 'Cancelled in the wallet. Nothing changed.' : message);
    } finally {
      setBusy(false);
    }
  };

  const post = (body: unknown) => fetch('/api/notifications/job-updates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const turnOn = () => act(() => post({ action: 'on', wallet: address, chainId, jobId, includeAnswer }));

  const turnOff = () => act(async () => {
    const issued = await post({ action: 'challenge-off', wallet: address, chainId, jobId });
    if (!issued.ok) return issued;
    const { challenge } = (await issued.json()) as { challenge: { challengeId: string; message: string } };
    const signature = await signMessageAsync({ message: challenge.message });
    return post({ action: 'off', wallet: address, chainId, jobId, challengeId: challenge.challengeId, signature });
  });

  /*
   * Until the offer is known, show nothing rather than the form: rendering
   * "type your email" and then replacing it with "updates are on" reads as
   * a glitch, and invites a duplicate subscription in the moment between.
   */
  if (offer.isPending || offer.isError) return null;

  const box = (children: React.ReactNode) => (
    <div className={cn('flex flex-col gap-3 rounded-[12px] border border-rule bg-raised p-4', className)}>{children}</div>
  );

  if (offer.data.kind === 'ask-email') return <JobEmailAlert jobId={jobId} chainId={chainId} className={className} compact={compact} />;

  if (offer.data.kind === 'await-inbox') {
    return box(
      <p className="flex items-start gap-2 text-[13.5px] text-ink-2">
        <Icon.Clock size={16} className="mt-0.5 shrink-0 text-ink-3" />
        <span>
          Confirm the link sent to <strong className="font-medium text-ink">{offer.data.email}</strong> and this job becomes one click. Until it is confirmed, nothing is sent there.
        </span>
      </p>,
    );
  }

  if (offer.data.kind === 'on') {
    return box(
      <>
        <p className="flex items-start gap-2 text-[13.5px] text-ink-2">
          <Icon.Check size={16} className="mt-0.5 shrink-0 text-ok" />
          <span>
            Updates for job #{jobId} go to <strong className="font-medium text-ink">{offer.data.email}</strong> &mdash; when it is delivered{offer.data.includeAnswer ? ', with the full answer,' : ', with a preview of the answer,'} and when it settles.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" intent="secondary" size="s" busy={busy} disabled={busy} onClick={() => void turnOff()}>
            Stop updates for this job
          </Button>
          {mode !== 'external' && (
            <span className="text-[12.5px] text-ink-3">Stopping needs a browser-wallet signature, or the unsubscribe link in any of the emails.</span>
          )}
        </div>
        {error && <p className="text-[13px] text-bad">{error}</p>}
      </>,
    );
  }

  const resuming = offer.data.kind === 'resume';
  return box(
    <>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{resuming ? 'Get updates for this job again' : 'Get updates for this job'}</p>
        <p className="text-[13px] text-ink-2">
          To <strong className="font-medium text-ink">{offer.data.email}</strong>, the address this wallet has already confirmed. Nothing to type and no link to click.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="s" busy={busy} disabled={busy} onClick={() => void turnOn()}>
          {resuming ? 'Turn updates back on' : 'Notify me'}
        </Button>
      </div>
      <Checkbox
        checked={includeAnswer}
        onChange={(e) => setIncludeAnswer(e.target.checked)}
        label="Include the full answer in the email"
        description="Otherwise a short preview. The job page always has the whole answer, checked against the chain."
      />
      {error && <p className="text-[13px] text-bad">{error}</p>}
    </>,
  );
}
