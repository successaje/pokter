'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { awardMessage, bidMessage, withdrawMessage, type Bid, type BidContent } from '@/lib/briefs/model';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { BUDGET_MAX, BUDGET_MIN } from '@/lib/hire/budget-limits';
import { chainLabel } from '@/lib/network/presentation';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { Button } from '@/ui/Button';
import { Field, Input, Textarea } from '@/ui/Field';
import { Notice } from '@/ui/Feedback';

/**
 * Offer an agent for a brief.
 *
 * The agent is given by its ERC-8004 identity rather than picked from a
 * list, because the registry — not Pokter — decides who may bid: the API
 * refuses any signature that is not the owner the registry names for that
 * token. A dropdown of "your agents" would be Pokter's opinion of
 * ownership, and this is the one place it should not have one.
 */
export function PlaceBid({ briefId }: { briefId: string }) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const [agent, setAgent] = useState('');
  const [price, setPrice] = useState('');
  const [deliverDays, setDeliverDays] = useState('7');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!address || !canSign) {
      setError('Connect the wallet the registry names as the agent’s owner.');
      return;
    }
    const match = /^(56|97):(\d{1,12})$/.exec(agent.trim());
    if (!match) {
      setError('Give the agent as chain:token, for example 97:2554.');
      return;
    }
    const content: BidContent = {
      agentChainId: Number(match[1]),
      agentTokenId: match[2],
      priceU: Number(price),
      deliverDays: Number(deliverDays),
      note: note.trim(),
    };
    if (!(content.priceU >= BUDGET_MIN && content.priceU <= BUDGET_MAX)) {
      setError(`Give the price you will take, between ${BUDGET_MIN} and ${BUDGET_MAX} $U: the most one hire can be funded with today.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const placedAt = new Date().toISOString();
      const signature = await sign(bidMessage({ ...content, briefId, bidder: address, placedAt }));
      const response = await fetch(`/api/briefs/${briefId}/bids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bidder: address, signature, placedAt, content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The proposal was not sent.');
      setAgent('');
      setPrice('');
      setNote('');
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'The proposal was not sent.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was sent.' : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Your agent" hint="chain:token">
          {(p) => <Input {...p} value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="97:2554" />}
        </Field>
        <Field label="Your price" hint="In $U.">
          {(p) => <Input {...p} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0.40" />}
        </Field>
        <Field label="Deliver within" hint="Days.">
          {(p) => <Input {...p} value={deliverDays} onChange={(e) => setDeliverDays(e.target.value)} inputMode="numeric" />}
        </Field>
      </div>
      <Field label="How you will do it" hint="Optional, and the place to say what in the brief you would do differently.">
        {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1200} className="min-h-20" />}
      </Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12.5px] text-ink-3">Signed by the owner wallet the registry names for that agent. A signature, not a transaction.</span>
        <Button onClick={submit} busy={busy}>
          {busy ? 'Approve in your wallet' : 'Sign and send proposal'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Choosing a proposal, in two steps: review it, then confirm.
 *
 * The confirmation says plainly what choosing does and does not do. It
 * records the poster's decision with a signature and moves no money; the
 * hire that follows asks the agent for a quote on this exact request and
 * is funded by the poster's own wallet, on its own screen.
 */
export function AwardBid({ briefId, bid, poster, chainId }: { briefId: string; bid: Bid; poster: string; chainId: number }) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const [reviewing, setReviewing] = useState(false);
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
      const signature = await sign(awardMessage(briefId, bid.id, poster));
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
          Choose this proposal: {formatQuotedPrice(bid.priceU)}, delivered within {bid.deliverDays === 1 ? '1 day' : `${bid.deliverDays} days`} of hiring.
        </span>{' '}
        Choosing records your decision with a signature and moves no money. Next you review the agent&rsquo;s quote for this
        request and fund the escrow on {chainLabel(chainId)} yourself.
      </p>
      {error && <p className="text-[12.5px] text-bad">{error}</p>}
      <span className="flex flex-wrap justify-end gap-2">
        <Button size="s" intent="ghost" onClick={() => setReviewing(false)} disabled={busy}>
          Not yet
        </Button>
        <Button size="s" onClick={submit} busy={busy}>
          {busy ? 'Approve in your wallet' : 'Choose this proposal'}
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
