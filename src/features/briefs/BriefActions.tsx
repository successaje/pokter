'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { awardMessage, reopenMessage, requestAmountLabel, withdrawMessage, type Bid } from '@/lib/briefs/model';
import { fundsAboveBudget } from '@/lib/briefs/proposal-price';
import { chainLabel } from '@/lib/network/presentation';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { Button } from '@/ui/Button';

/**
 * Choosing a proposal, in two steps: review it, then confirm.
 *
 * The confirmation says plainly what choosing does and does not do. It
 * records the poster's decision with a signature and moves no money; the
 * hire that follows asks the agent for a quote on this exact request and
 * is funded by the poster's own wallet, on its own screen.
 */
export function AwardBid({
  briefId,
  bid,
  poster,
  chainId,
  budget,
}: {
  briefId: string;
  bid: Bid;
  poster: string;
  chainId: number;
  /** The request's budget, so a proposal above it is chosen knowingly. */
  budget: { paymentToken: string | null; budgetRaw: string; label: string };
}) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const [reviewing, setReviewing] = useState(false);
  const above = fundsAboveBudget(bid, { chainId, paymentToken: budget.paymentToken, budgetRaw: budget.budgetRaw });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPoster = address?.toLowerCase() === poster.toLowerCase();
  if (!isPoster) return null;

  const submit = async () => {
    if (!canSign) {
      setError('Connect the wallet that posted this request.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signature = await sign(awardMessage(briefId, bid.id, poster, above));
      const response = await fetch(`/api/briefs/${briefId}/award`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bidId: bid.id, signature }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Your choice was not recorded.');
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'Your choice was not recorded.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was chosen.' : message);
    } finally {
      setBusy(false);
    }
  };

  if (!reviewing) {
    return (
      <Button size="s" intent="secondary" onClick={() => setReviewing(true)}>
        Review proposal
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3 rounded-[10px] bg-sunken p-3.5">
      <p className="text-[13px] leading-relaxed text-ink-2">
        <span className="font-medium text-ink">
          Choose this proposal: {requestAmountLabel({ chainId, paymentToken: bid.paymentToken }, bid.priceU)}, delivered within {bid.deliverDays === 1 ? '1 day' : `${bid.deliverDays} days`} of hiring.
        </span>{' '}
        Choosing records your decision with a signature and moves no money. Next you review the agent&rsquo;s quote for this
        request and fund the escrow on {chainLabel(chainId)} yourself.
      </p>
      {/* Above the budget, agreeing to the amount is a step of its own, and the amount goes into the signature. */}
      {above && (
        <label className="flex items-start gap-2.5 rounded-[8px] border border-[color-mix(in_oklab,var(--watch)_35%,transparent)] bg-watch-wash px-3 py-2.5 text-[13px] leading-snug text-ink">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--ink)]" />
          <span>
            <span className="font-medium">This is above your budget of {budget.label}.</span> I&rsquo;ll fund {above}, the price this agent signed for the request.
          </span>
        </label>
      )}
      {error && <p className="text-[12.5px] text-bad">{error}</p>}
      <span className="flex flex-wrap justify-end gap-2">
        <Button size="s" intent="ghost" onClick={() => setReviewing(false)} disabled={busy}>
          Not yet
        </Button>
        <Button size="s" onClick={submit} busy={busy} disabled={Boolean(above) && !agreed}>
          {busy ? 'Approve in your wallet' : 'Choose this proposal'}
        </Button>
      </span>
    </div>
  );
}

/**
 * The poster changing their mind about a choice that has not been hired.
 *
 * Choosing moved no money, so undoing it moves none either: the request
 * goes back to open and any proposal can be chosen. Signed, and dated so
 * the signature cannot be replayed later (`reopenMessage`).
 */
export function ChangeChoice({ briefId, bidId, poster }: { briefId: string; bidId: string; poster: string }) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (address?.toLowerCase() !== poster.toLowerCase()) return null;

  const submit = async () => {
    if (!canSign) {
      setError('Connect the wallet that posted this request.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const decidedAt = new Date().toISOString();
      const signature = await sign(reopenMessage(briefId, bidId, poster, decidedAt));
      const response = await fetch(`/api/briefs/${briefId}/reopen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signature, decidedAt }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Your choice was not changed.');
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'Your choice was not changed.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Your choice stands.' : message);
    } finally {
      setBusy(false);
    }
  };

  if (!reviewing) {
    return (
      <Button size="s" intent="ghost" onClick={() => setReviewing(true)}>
        Change my choice
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3 rounded-[10px] bg-sunken p-3.5">
      <p className="text-[13px] leading-relaxed text-ink-2">
        <span className="font-medium text-ink">Choose a different proposal?</span> This one is no longer chosen and the request reopens, so you can choose any proposal. Signing records the change and moves no money.
      </p>
      {error && <p className="text-[12.5px] text-bad">{error}</p>}
      <span className="flex flex-wrap justify-end gap-2">
        <Button size="s" intent="ghost" onClick={() => setReviewing(false)} disabled={busy}>
          Keep this one
        </Button>
        <Button size="s" onClick={submit} busy={busy}>
          {busy ? 'Approve in your wallet' : 'Change my choice'}
        </Button>
      </span>
    </div>
  );
}

/** The poster taking an open request down, signed by the wallet that posted it. */
export function WithdrawRequest({ briefId, poster }: { briefId: string; poster: string }) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (address?.toLowerCase() !== poster.toLowerCase()) return null;

  const submit = async () => {
    if (!canSign) {
      setError('Connect the wallet that posted this request.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signature = await sign(withdrawMessage(briefId, poster));
      const response = await fetch(`/api/briefs/${briefId}/withdraw`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signature }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The request was not withdrawn.');
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'The request was not withdrawn.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. The request is still open.' : message);
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <Button size="s" intent="ghost" onClick={() => setConfirming(true)}>
        Withdraw request
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] border border-rule bg-raised p-4">
      <p className="text-[13px] leading-relaxed text-ink-2">
        Builders can no longer send proposals, and none can be chosen. The request stays visible, marked withdrawn, for anyone who
        already answered it.
      </p>
      {error && <p className="text-[12.5px] text-bad">{error}</p>}
      <span className="flex flex-wrap justify-end gap-2">
        <Button size="s" intent="ghost" onClick={() => setConfirming(false)} disabled={busy}>
          Keep it open
        </Button>
        <Button size="s" intent="danger" onClick={submit} busy={busy}>
          {busy ? 'Approve in your wallet' : 'Withdraw request'}
        </Button>
      </span>
    </div>
  );
}
