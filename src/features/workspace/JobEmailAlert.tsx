'use client';

import { useState } from 'react';

import { useActiveWallet } from '@/lib/wallet/active';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Field';
import { Icon } from '@/ui/icons';

/**
 * "Email me when it is delivered", offered where it is plainly useful: just
 * after a hire is funded, and on the job while it is open. One field, a
 * confirmation link, and a choice to receive the whole answer rather than a
 * preview. Asks for nothing beyond the address.
 */
export function JobEmailAlert({ jobId, chainId, className, compact = false }: { jobId: string; chainId: number; className?: string; compact?: boolean }) {
  const { address } = useActiveWallet();
  const [email, setEmail] = useState('');
  const [includeAnswer, setIncludeAnswer] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!address) return null;

  if (state === 'sent') {
    return (
      <p className={cn('flex items-start gap-2 rounded-[12px] border border-rule bg-raised px-4 py-3 text-[13.5px] text-ink-2', className)}>
        <Icon.Check size={16} className="mt-0.5 shrink-0 text-ok" />
        <span>
          Check <strong className="font-medium text-ink">{email}</strong> and confirm. After that you will hear when job #{jobId} is delivered{includeAnswer ? ', with the full answer,' : ', with a preview of the answer,'} and when it settles.
        </span>
      </p>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setError(null);
    try {
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), walletAddress: address, chainId, jobId, includeAnswer }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The email could not be set up. Try again.');
      setState('sent');
    } catch (caught) {
      setError((caught as Error).message);
      setState('idle');
    }
  };

  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-3 rounded-[12px] border border-rule bg-raised p-4', className)}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">Email me when it is delivered</p>
        {!compact && <p className="text-[13px] text-ink-2">A preview of the agent&rsquo;s answer and a link to verify it. No account, and nothing else.</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex h-10 min-w-0 flex-1 items-center rounded-[9px] border border-rule-strong bg-paper px-3 focus-within:border-ink">
          <span className="sr-only">Email address</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3" />
        </label>
        <Button type="submit" size="s" busy={state === 'sending'} disabled={state === 'sending' || !email.trim()} className="h-10">
          Notify me
        </Button>
      </div>
      <Checkbox checked={includeAnswer} onChange={(e) => setIncludeAnswer(e.target.checked)} label="Include the full answer in the email" description="Otherwise a short preview. The job page always has the whole answer, checked against the chain." />
      {error && <p className="text-[13px] text-bad">{error}</p>}
    </form>
  );
}
