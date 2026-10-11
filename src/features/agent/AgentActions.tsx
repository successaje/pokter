'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { deviceFollow, forgetFollow, maskEmail, rememberFollow, subscribeToFollows } from '@/lib/wallet/follows';
import { isAgentSaved, subscribeToSavedAgents, toggleSavedAgent, type SavedAgent } from '@/lib/wallet/saved-agents';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';

const iconButton =
  'inline-flex h-9 items-center gap-2 rounded-[8px] border border-rule-strong bg-raised px-3 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink';

/** Saves to this device. Saved agents are re-checked in the background. */
export function SaveButton({ agent, className }: { agent: Omit<SavedAgent, 'savedAt'>; className?: string }) {
  const saved = useSyncExternalStore(
    subscribeToSavedAgents,
    () => isAgentSaved(agent.chainId, agent.tokenId),
    () => false,
  );
  return (
    <button
      type="button"
      onClick={() => toggleSavedAgent(agent)}
      aria-pressed={saved}
      className={cn(iconButton, saved && 'border-ink text-ink', className)}
      title={saved ? 'Saved on this device. Pokter will flag changes to its evidence, availability or price.' : 'Save to watch for changes'}
    >
      {saved ? <Icon.BookmarkFilled size={15} /> : <Icon.Bookmark size={15} />}
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}

export function ShareButton({ title, path, className }: { title: string; path: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn(iconButton, className)}
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        try {
          if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* Dismissed share sheet or blocked clipboard: nothing to report. */
        }
      }}
    >
      {copied ? <Icon.Check size={15} /> : <Icon.Share size={15} />}
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}

/**
 * Follow an agent by email: hear when it stops answering or comes back,
 * changes its signed price, or delivers or misses a paid job. Confirmed by
 * a link in the first email, which returns here; one click in any alert
 * stops it. The button reflects what this device asked for: pending until
 * the link is opened, then following.
 */
export function FollowButton({ chainId, tokenId, name, className }: { chainId: number; tokenId: string; name: string; className?: string }) {
  const follow = useSyncExternalStore(subscribeToFollows, () => deviceFollow(chainId, tokenId), () => null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Arriving from the confirmation or unsubscribe link in an email.
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('email');
    if (status === 'verified') rememberFollow(chainId, tokenId, { email: null, status: 'confirmed' });
    if (status === 'unsubscribed') forgetFollow(chainId, tokenId);
  }, [chainId, tokenId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setError(null);
    try {
      const response = await fetch('/api/notifications/follow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), chainId, tokenId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Alerts could not be set up. Try again.');
      rememberFollow(chainId, tokenId, { email: email.trim(), status: 'pending' });
      setState('sent');
    } catch (caught) {
      setError((caught as Error).message);
      setState('idle');
    }
  };

  const label = follow?.status === 'confirmed' ? 'Following' : follow?.status === 'pending' ? 'Check your email' : 'Follow';
  const masked = follow?.email ? maskEmail(follow.email) : null;

  return (
    <>
      <button
        type="button"
        aria-pressed={follow?.status === 'confirmed'}
        className={cn(iconButton, follow?.status === 'confirmed' && 'border-ink text-ink', className)}
        onClick={() => {
          setState('idle');
          setOpen(true);
        }}
      >
        {follow?.status === 'confirmed' ? <Icon.Check size={15} /> : follow?.status === 'pending' ? <Icon.Clock size={15} /> : <Icon.Bell size={15} />}
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={follow?.status === 'confirmed' ? `Following ${name}` : `Follow ${name}`} description="Email alerts when something Pokter measures about this agent changes.">
        {state === 'sent' ? (
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <Icon.Check size={16} className="mt-0.5 shrink-0 text-ok" />
            <span>
              Check <strong className="font-medium text-ink">{email}</strong> and confirm. The link brings you back here, and then you will hear about {name} only when something changes.
            </span>
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {follow?.status === 'confirmed' && (
              <p className="rounded-[10px] border border-rule bg-sunken/50 px-3 py-2.5 text-[13.5px] text-ink-2">
                You follow {name} from this device{masked ? `, with ${masked}` : ''}. To stop, use the link at the bottom of any alert. You can also add another address below.
              </p>
            )}
            {follow?.status === 'pending' && (
              <p className="rounded-[10px] border border-rule bg-sunken/50 px-3 py-2.5 text-[13.5px] text-ink-2">
                A confirmation was sent{masked ? ` to ${masked}` : ''}. Open the link in it to start alerts. Nothing arrived? Send it again below.
              </p>
            )}
            <ul className="flex flex-col gap-1.5 text-[13.5px] text-ink-2">
              <li>It stops answering, or starts again</li>
              <li>Its signed price changes, appears or lapses</li>
              <li>It delivers or misses a paid job</li>
            </ul>
            <label className="flex h-11 items-center rounded-[10px] border border-rule-strong bg-paper px-3 focus-within:border-ink">
              <span className="sr-only">Email address</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3" />
            </label>
            {error && <p className="text-[13px] text-bad">{error}</p>}
            <Button type="submit" busy={state === 'sending'} disabled={state === 'sending' || !email.trim()}>
              {follow?.status === 'pending' ? 'Send it again' : 'Send confirmation'}
            </Button>
            <p className="text-[12px] text-ink-3">No account and no wallet. Every alert has a one-click stop.</p>
          </form>
        )}
      </Sheet>
    </>
  );
}
