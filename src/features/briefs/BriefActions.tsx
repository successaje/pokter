'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { awardMessage, bidMessage, type Bid, type BidContent } from '@/lib/briefs/model';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { Button } from '@/ui/Button';
import { Field, Input, Textarea } from '@/ui/Field';
import { Notice } from '@/ui/Feedback';
import { PostBrief } from './PostBrief';

export function PostBriefButton() {
  /* "Post a job" from the workspace arrives as /requests?post=1 and opens the form straight away. */
  const [open, setOpen] = useState(useSearchParams().get('post') === '1');
  return (
    <>
      <Button onClick={() => setOpen(true)}>Post a job</Button>
      <PostBrief open={open} onClose={() => setOpen(false)} />
    </>
  );
}

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
    if (!(content.priceU > 0)) {
      setError('Give the price you will take, in $U.');
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
      if (!response.ok) throw new Error(payload.error ?? 'The bid was not placed.');
      setAgent('');
      setPrice('');
      setNote('');
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'The bid was not placed.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was placed.' : message);
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
          {busy ? 'Approve in your wallet' : 'Sign and bid'}
        </Button>
      </div>
    </div>
  );
}

/** Accepting a bid: signed by the poster, and it funds nothing by itself. */
export function AwardBid({ briefId, bid, poster }: { briefId: string; bid: Bid; poster: string }) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPoster = address?.toLowerCase() === poster.toLowerCase();
  if (!isPoster) return null;

  const submit = async () => {
    if (!canSign) {
      setError('Connect the wallet that posted this brief.');
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
      if (!response.ok) throw new Error(payload.error ?? 'The award was not recorded.');
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'The award was not recorded.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was awarded.' : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex flex-col items-end gap-1.5">
      <Button size="s" onClick={submit} busy={busy}>
        Award this bid
      </Button>
      {error && <span className="text-[12px] text-flag">{error}</span>}
    </span>
  );
}
