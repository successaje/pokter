'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { bidMessage, requestAmountLabel, requestTokenOf, requestUnit, type BidContent } from '@/lib/briefs/model';
import { aboveBudget, proposalQuoteFresh, type ProposalQuote } from '@/lib/briefs/proposal-price';
import { DELIVERY_OPTIONS, type ProposalPrefill } from '@/lib/briefs/public-view';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { AgentAvatar } from '@/ui/Agent';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Controls';
import { Notice, Skeleton } from '@/ui/Feedback';
import { Field, Select, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';

/** `paymentToken` is the request's (null on a request from before tokens, which is $U); the proposal is always in it. */
export type ProposalRequest = { id: string; title: string; chainId: number; deliverDays: number; budgetU: number; budgetRaw: string; paymentToken: string | null; poster: string };
type Agent = { chainId: number; tokenId: string; name: string; imageUrl: string | null; category: string | null; owner?: string };

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/**
 * Make a proposal: choose one of your agents, say how it will do the work
 * and by when, take the price it signs for this request, then review and
 * sign.
 *
 * The price is never typed. The agent is asked for a signed quote for this
 * request, in its token, and that is the proposal's price
 * (`proposal-price.ts`); to offer less, the agent signs less. It may be
 * above the budget, which the poster sees marked.
 *
 * The agent comes from the wallet's own list, behind "Add agent", so nobody
 * types a registry number they have to look up elsewhere; entering an ID
 * stays as a fallback and shows which agent it is, and who owns it, first.
 * The proposal endpoint checks the registry's owner again when it is sent.
 *
 * One agent per proposal, because the signed proposal, the choice and the
 * hire each name one agent. Selecting an agent never calls it: asking it
 * for its price is a button of its own.
 */
export function ProposalForm({ request, prefill = null }: { request: ProposalRequest; prefill?: (Omit<ProposalPrefill, 'deliverDays'> & { deliverDays: number | null }) | null }) {
  const router = useRouter();
  const { openConnect } = useConnect();
  const { address, canSign, sign } = useActiveSigner();
  /* The request's money, and only it: a proposal is priced in the token its request named. */
  const token = requestTokenOf(request);
  const unit = requestUnit(request);
  const budgetLabel = requestAmountLabel(request, request.budgetU);
  const queryClient = useQueryClient();

  /*
   * A proposal prepared elsewhere (an assistant's prepare_proposal) opens
   * filled in. Its agent is looked up the way "Add by ID" looks one up, so
   * the owner sees which agent it is and who owns it; every field stays
   * editable, and nothing is sent until the owner signs.
   */
  const prefilled = useQuery({
    queryKey: ['proposal-prefill-agent', prefill?.agentChainId, prefill?.agentTokenId],
    enabled: Boolean(prefill),
    queryFn: async (): Promise<Agent> => {
      const r = await fetch(`/api/builders/agent?chainId=${prefill!.agentChainId}&tokenId=${prefill!.agentTokenId}`, { cache: 'no-store' });
      const body = (await r.json().catch(() => ({}))) as Agent & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'That agent could not be found.');
      return body;
    },
  });
  /* `undefined` until the owner picks or clears one by hand; until then the prepared agent stands. */
  const [picked, setAgent] = useState<Agent | null | undefined>(undefined);
  const agent = picked === undefined ? (prefilled.data ?? null) : picked;
  const [note, setNote] = useState(prefill?.note ?? '');
  /* The agent's signed price for this request: the newest Pokter holds, or the one asked for here. */
  const quoteKey = ['proposal-quote', request.id, agent?.chainId, agent?.tokenId];
  const held = useQuery({
    queryKey: quoteKey,
    enabled: Boolean(agent),
    queryFn: async (): Promise<{ quote: ProposalQuote | null; label: string | null }> => {
      const r = await fetch(`/api/briefs/${request.id}/quote?agentChainId=${agent!.chainId}&agentTokenId=${agent!.tokenId}`, { cache: 'no-store' });
      if (!r.ok) return { quote: null, label: null };
      return (await r.json()) as { quote: ProposalQuote | null; label: string | null };
    },
  });
  const ask = useMutation({
    mutationFn: async (): Promise<{ quote: ProposalQuote; label: string }> => {
      const r = await fetch(`/api/briefs/${request.id}/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentChainId: agent!.chainId, agentTokenId: agent!.tokenId }),
      });
      const body = (await r.json().catch(() => ({}))) as { quote?: ProposalQuote; label?: string; error?: string };
      if (!r.ok || !body.quote) throw new Error(body.error ?? 'The agent did not sign a price for this request.');
      return { quote: body.quote, label: body.label ?? `${body.quote.priceU} ${unit}` };
    },
    onSuccess: (data) => queryClient.setQueryData(quoteKey, data),
  });
  const quote = held.data?.quote && proposalQuoteFresh(held.data.quote) ? held.data.quote : null;
  const priceLabel = quote ? (held.data?.label ?? `${quote.priceU} ${unit}`) : null;
  const over = Boolean(quote && token && aboveBudget({ paymentToken: token.address, priceRaw: quote.priceRaw }, request));
  const [deliverDays, setDeliverDays] = useState<number>(prefill?.deliverDays ?? ((DELIVERY_OPTIONS as readonly number[]).includes(request.deliverDays) ? request.deliverDays : 3));
  const [step, setStep] = useState<'write' | 'review'>('write');
  const [problems, setProblems] = useState<Partial<Record<'agent' | 'note' | 'price', string>>>({});
  const askPrice = () => {
    setProblems((p) => ({ ...p, price: undefined }));
    ask.mutate();
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const verified = Boolean(agent?.owner && address && agent.owner.toLowerCase() === address.toLowerCase());
  const later = deliverDays > request.deliverDays;

  const review = () => {
    const found: typeof problems = {};
    if (!agent) found.agent = 'Add the agent that will do the work.';
    if (!note.trim()) found.note = 'Say how it will do the work: buyers compare proposals on this.';
    if (!token) found.price = 'This request is priced in a token Pokter cannot read, so it cannot take a proposal.';
    else if (agent && !quote) found.price = 'Ask your agent for its price for this request first.';
    setProblems(found);
    if (Object.keys(found).length === 0) {
      setError(null);
      setStep('review');
    }
  };

  const send = async () => {
    if (!agent) return;
    if (!address || !canSign) {
      openConnect('to sign this proposal');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!token || !quote) return;
      /* Exactly what the agent signed for this request; the proposal route checks it against the same quote. */
      const content: BidContent = {
        agentChainId: agent.chainId,
        agentTokenId: agent.tokenId,
        priceU: quote.priceU,
        paymentToken: token.address,
        priceRaw: quote.priceRaw,
        deliverDays,
        note: note.trim(),
      };
      const placedAt = new Date().toISOString();
      /* Signed on the request's chain, which is what names a non-$U token in the message. */
      const signature = await sign(bidMessage({ ...content, chainId: request.chainId, briefId: request.id, bidder: address, placedAt }));
      const response = await fetch(`/api/briefs/${request.id}/bids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bidder: address, signature, placedAt, content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The proposal was not sent.');
      setSent(true);
      setStep('write');
      setNote('');
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'The proposal was not sent.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was sent.' : message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Notice
        tone="ok"
        title="Proposal sent"
        action={
          <Button size="s" intent="secondary" onClick={() => setSent(false)}>
            Send another
          </Button>
        }
      >
        It is listed with the other proposals, signed by your wallet. Sending again for the same agent replaces it.
      </Notice>
    );
  }

  if (step === 'review' && agent) {
    return (
      <div className="flex flex-col gap-4">
        <span className="t-label">Review, then sign</span>
        <SelectedAgent agent={agent} verified={verified} />
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-rule bg-rule">
          <div className="bg-raised px-4 py-3">
            <dt className="text-[12px] text-ink-3">Price</dt>
            <dd className="t-readout text-[15px]">{priceLabel}</dd>
            <dd className="text-[11.5px] text-ink-3">Signed by the agent</dd>
            {over && <dd className="text-[11.5px] font-medium text-watch">Above the budget of {budgetLabel}</dd>}
            {token && !token.offered && <dd className="t-readout break-all text-[11.5px] text-ink-3">{token.address}</dd>}
          </div>
          <div className="bg-raised px-4 py-3">
            <dt className="text-[12px] text-ink-3">Delivery</dt>
            <dd className={cn('text-[13.5px] font-medium', later && 'text-watch')}>
              {days(deliverDays)} after hiring{later ? ` · asked ${days(request.deliverDays)}` : ''}
            </dd>
          </div>
        </dl>
        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink-2">{note.trim()}</p>
        {address && !verified && (
          <Notice tone="watch" title="Connect the agent’s owner to send">
            {agent.owner
              ? `The registry names ${shortAddress(agent.owner)} as this agent’s owner, and only that wallet can sign its proposal. Your proposal stays here while you switch.`
              : 'Only the wallet the registry names as this agent’s owner can sign its proposal.'}
          </Notice>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        <Button onClick={send} busy={busy} disabled={Boolean(address) && !verified} className="w-full justify-center">
          {busy ? 'Approve in your wallet' : address ? 'Sign and send' : 'Connect a wallet to send'}
        </Button>
        <span className="flex items-center justify-between gap-3">
          <Button intent="ghost" size="s" onClick={() => setStep('write')} disabled={busy} icon={<Icon.ChevronLeft size={14} />}>
            Edit
          </Button>
          <span className="text-[12px] text-ink-3">A signature, not a transaction. No fee.</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {prefill && (
        <Notice tone="watch" title="Filled in for you">
          {prefilled.isError
            ? `A prepared proposal named agent ${prefill.agentChainId}:${prefill.agentTokenId}, which could not be found. Add the agent yourself.`
            : 'These values came from the link you opened. Anyone can edit a link, so they say nothing about who prepared them. Check every field before you review and sign: nothing is sent until you do. The price is never taken from a link: it is the one your agent signs.'}
        </Notice>
      )}
      <AgentField agent={agent} verified={verified} onChange={setAgent} error={problems.agent} />

      <Field label="Your approach" hint="How it will do the work and what it will deliver. Say here if you would change anything in the request." error={problems.note}>
        {(p) => <Textarea {...p} value={note} maxLength={1200} onChange={(e) => setNote(e.target.value)} className="min-h-28" />}
      </Field>

      {/* The agent's own signed price for this request, never a typed one. */}
      <div className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">Price</span>
          <span className="text-[12px] text-ink-3">Budget {budgetLabel}{request.chainId === 97 ? ' (test tokens)' : ''}</span>
        </span>
        {quote ? (
          <div className={cn('flex items-start justify-between gap-3 rounded-[10px] border px-3.5 py-3', over ? 'border-[color-mix(in_oklab,var(--watch)_35%,transparent)] bg-watch-wash' : 'border-rule bg-sunken')}>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="t-readout text-[16px]">{priceLabel}</span>
              <span className="text-[12px] text-ink-3">Signed by {agent?.name ?? 'the agent'} for this request, {sinceSigned(quote.quotedAt)}.</span>
              {over && <span className="text-[12px] font-medium text-watch">Above the budget of {budgetLabel}. The poster sees it marked, and agrees to it when choosing.</span>}
            </span>
            <Button size="s" intent="ghost" onClick={askPrice} busy={ask.isPending}>
              Ask again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1.5">
            <Button size="s" intent="secondary" onClick={askPrice} busy={ask.isPending} disabled={!agent}>
              {agent ? `Ask ${agent.name} for its price` : 'Add your agent to ask its price'}
            </Button>
            <span className="text-[12px] leading-snug text-ink-3">
              Your agent signs a price for this request and that is your proposal&rsquo;s price. To offer less, have it sign less.
            </span>
          </div>
        )}
        {ask.isError && <p className="text-[13px] text-bad">{(ask.error as Error).message}</p>}
        {problems.price && <p className="text-[13px] text-bad">{problems.price}</p>}
      </div>

      <Field label="Deliver within" hint={later ? <span className="font-medium text-watch">Later than the {days(request.deliverDays)} asked.</span> : 'Days after hiring.'}>
        {(p) => (
          <Select {...p} value={deliverDays} onChange={(e) => setDeliverDays(Number(e.target.value))}>
            {DELIVERY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {days(d)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <Button onClick={review} trailing={<Icon.Arrow size={15} />} className="w-full justify-center">
          Review proposal
        </Button>
        <span className="text-center text-[12px] text-ink-3">Review first. Sign and send in the next step.</span>
      </div>
    </div>
  );
}

/** The agent slot: the chosen agent, or the "Add agent" picker that fills it. */
function AgentField({ agent, verified, onChange, error }: { agent: Agent | null; verified: boolean; onChange: (agent: Agent | null) => void; error?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const layer = useDismissibleLayer<HTMLDivElement>({ open, onDismiss: close });

  return (
    <div ref={layer} className="relative flex flex-col gap-2">
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Your agent</span>
        <Button size="s" intent="secondary" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} icon={<Icon.Plus size={14} />}>
          {agent ? 'Change' : 'Add agent'}
        </Button>
      </span>
      {agent ? (
        <div className="flex items-center gap-2 rounded-[12px] border border-rule-strong bg-raised p-3">
          <SelectedAgent agent={agent} verified={verified} />
          <button type="button" aria-label="Remove agent" onClick={() => onChange(null)} className="grid size-8 shrink-0 place-items-center rounded-[8px] text-ink-3 hover:bg-sunken hover:text-ink">
            <Icon.Close size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn('rounded-[12px] border border-dashed px-4 py-4 text-left text-[13.5px] text-ink-3 hover:border-ink-3 hover:text-ink-2', error ? 'border-bad' : 'border-rule-strong')}
        >
          Add the agent that will do the work.
        </button>
      )}
      {error && !agent && <p className="text-[13px] text-bad">{error}</p>}
      {open && (
        <div role="dialog" aria-label="Choose an agent" className="absolute right-0 top-11 z-20 w-full max-w-[380px] rounded-[14px] border border-rule bg-raised p-3 shadow-float">
          <AgentPicker
            selected={agent}
            onPick={(picked) => {
              onChange(picked);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function SelectedAgent({ agent, verified }: { agent: Agent; verified: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <AgentAvatar name={agent.name} imageUrl={agent.imageUrl} seed={`${agent.chainId}:${agent.tokenId}`} size={40} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14.5px] font-medium">{agent.name}</span>
        <span className="truncate text-[12px] text-ink-3">
          #{agent.tokenId} · {agent.chainId === 56 ? 'BNB Chain' : 'BNB Testnet'}
          {agent.category ? ` · ${agent.category}` : ''}
        </span>
        {verified ? (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-ok">
            <Icon.Check size={12} /> Ownership verified
          </span>
        ) : agent.owner ? (
          <span className="mt-0.5 text-[12px] text-watch">Owned by {shortAddress(agent.owner)}</span>
        ) : null}
      </span>
    </span>
  );
}

/** "Choose from my agents", with entering an ID underneath it. */
function AgentPicker({ selected, onPick }: { selected: Agent | null; onPick: (agent: Agent) => void }) {
  const { address } = useActiveSigner();
  const { openConnect } = useConnect();
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState('');
  const owned = useQuery({
    queryKey: ['owned-agents', address],
    enabled: Boolean(address) && !manual,
    queryFn: async () => {
      const r = await fetch(`/api/builders/agents?address=${address}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('The agent index did not answer.');
      const body = (await r.json()) as { agents: Agent[]; unavailable?: number[] };
      if (body.agents.length === 0 && body.unavailable?.length) throw new Error('The agent index did not answer for one network.');
      return body.agents;
    },
  });
  const agents = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (owned.data ?? []).filter((a) => words.every((w) => `${a.name} ${a.tokenId} ${a.category ?? ''}`.toLowerCase().includes(w)));
  }, [owned.data, query]);

  if (manual) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setManual(false)} className="inline-flex w-fit items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          <Icon.ChevronLeft size={13} /> My agents
        </button>
        <AddById onFound={onPick} />
      </div>
    );
  }

  const manualLink = (
    <button type="button" onClick={() => setManual(true)} className="inline-flex items-center gap-1.5 border-t border-rule px-1 pt-3 text-[13.5px] font-medium text-ink-2 hover:text-ink">
      Enter agent ID manually <Icon.Arrow size={13} />
    </button>
  );

  let body;
  if (!address) {
    body = (
      <div className="flex flex-col items-start gap-2 px-1 py-1">
        <p className="text-[13px] text-ink-2">Connect the wallet that owns your agents to list them.</p>
        <Button size="s" onClick={() => openConnect('to choose one of your agents')} icon={<Icon.Wallet size={14} />}>
          Connect wallet
        </Button>
      </div>
    );
  } else if (owned.isPending) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (owned.isError) {
    /* A failed read is never shown as "you have no agents". */
    body = (
      <div className="flex flex-col items-start gap-2 px-1">
        <p className="text-[13px] text-ink-2">Your agents could not be listed. {(owned.error as Error).message}</p>
        <Button size="s" intent="secondary" onClick={() => void owned.refetch()} busy={owned.isFetching}>
          Retry
        </Button>
      </div>
    );
  } else if (owned.data.length === 0) {
    body = (
      <p className="px-1 text-[13px] text-ink-2">
        {shortAddress(address)} owns no agents yet.{' '}
        <Link href="/build/new" className="underline underline-offset-2 hover:text-ink">
          Create one
        </Link>
        .
      </p>
    );
  } else {
    body = (
      <>
        <label className="relative">
          <span className="sr-only">Search agents</span>
          <Icon.Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="h-10 w-full rounded-[9px] border border-rule-strong bg-raised pl-9 pr-3 text-[14px] placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
        </label>
        <ul role="listbox" aria-label="Your agents" className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {agents.map((a) => {
            const on = selected?.chainId === a.chainId && selected.tokenId === a.tokenId;
            return (
              <li key={`${a.chainId}:${a.tokenId}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onPick({ ...a, owner: address })}
                  className={cn('flex w-full items-center gap-3 rounded-[10px] p-2 text-left transition-colors', on ? 'bg-ok-wash' : 'hover:bg-sunken')}
                >
                  <AgentAvatar name={a.name} imageUrl={a.imageUrl} seed={`${a.chainId}:${a.tokenId}`} size={34} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-medium">{a.name}</span>
                    <span className="truncate text-[12px] text-ink-3">
                      {a.category ?? 'No category'} · {a.chainId === 56 ? 'BNB Chain' : 'Testnet'} #{a.tokenId}
                    </span>
                  </span>
                  <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', on ? 'border-ok bg-ok text-paper' : 'border-rule-strong')}>
                    {on && <Icon.Check size={12} />}
                  </span>
                </button>
              </li>
            );
          })}
          {agents.length === 0 && <li className="px-2 py-2 text-[13px] text-ink-3">No agent matches “{query}”.</li>}
        </ul>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="px-1 text-[14px] font-medium">Choose from my agents</span>
      {body}
      {manualLink}
    </div>
  );
}

/** The fallback: an agent by network and registry number, resolved before it is used. */
function AddById({ onFound }: { onFound: (agent: Agent) => void }) {
  const [chain, setChain] = useState<'56' | '97'>('97');
  const [tokenId, setTokenId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    const id = tokenId.trim().replace(/^#/, '');
    if (!/^\d{1,12}$/.test(id)) {
      setError('Give the agent’s registry number, for example 2618.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/builders/agent?chainId=${chain}&tokenId=${id}`, { cache: 'no-store' });
      const body = (await r.json().catch(() => ({}))) as Agent & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'That agent could not be found.');
      onFound(body);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Segmented label="Network" size="s" value={chain} onChange={setChain} options={[{ value: '56', label: 'BNB Chain' }, { value: '97', label: 'Testnet' }]} />
      <div className="flex gap-2">
        <input
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void find()}
          inputMode="numeric"
          placeholder="Agent ID, e.g. 2618"
          aria-label="Agent ID"
          className="t-readout h-9 min-w-0 flex-1 rounded-[9px] border border-rule-strong bg-raised px-3 text-[14px] placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <Button size="s" intent="secondary" onClick={find} busy={busy}>
          Find
        </Button>
      </div>
      <p className="text-[12px] text-ink-3">Pokter shows the agent and its registry owner before you use it.</p>
      {error && <p className="text-[13px] text-bad">{error}</p>}
    </div>
  );
}

/** How long ago the agent signed, in words. */
function sinceSigned(at: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60_000));
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}
