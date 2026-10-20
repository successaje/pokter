'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { bidMessage, type BidContent } from '@/lib/briefs/model';
import { BUDGET_MAX, BUDGET_MIN } from '@/lib/hire/budget-limits';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { AgentAvatar } from '@/ui/Agent';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Controls';
import { Notice, Skeleton } from '@/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';

type Agent = { chainId: number; tokenId: string; name: string; imageUrl: string | null; category: string | null; owner?: string };

const DELIVERY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];
const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/**
 * Send a proposal: choose one of your agents, say how it will do the work,
 * at what price and by when, then review and sign.
 *
 * The agent comes from the wallet's own list, so nobody types a registry
 * number they have to look up elsewhere. Adding one by id stays as a
 * fallback, and shows which agent the id is and who owns it before
 * anything is written. Either way the proposal endpoint checks the
 * registry's owner again when it is sent; this only says so sooner.
 *
 * One agent per proposal, because the signed proposal, the award and the
 * hire each name one agent. Selecting an agent does not call it.
 */
export function ProposalForm({ briefId, requestDays, requestBudgetU }: { briefId: string; requestDays: number; requestBudgetU: number }) {
  const router = useRouter();
  const { openConnect } = useConnect();
  const { address, canSign, sign } = useActiveSigner();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [manual, setManual] = useState(false);
  const [note, setNote] = useState('');
  const [price, setPrice] = useState('');
  const [deliverDays, setDeliverDays] = useState(DELIVERY_OPTIONS.includes(requestDays) ? requestDays : 3);
  const [step, setStep] = useState<'write' | 'review'>('write');
  const [problems, setProblems] = useState<Partial<Record<'agent' | 'note' | 'price', string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const ownsAgent = Boolean(agent && address && (!agent.owner || agent.owner.toLowerCase() === address.toLowerCase()));
  const later = deliverDays > requestDays;

  const review = () => {
    const found: typeof problems = {};
    if (!agent) found.agent = 'Choose the agent that will do the work.';
    if (!note.trim()) found.note = 'Say how the agent will do it: the buyer compares proposals on this.';
    const priceU = Number(price);
    if (!(priceU >= BUDGET_MIN && priceU <= BUDGET_MAX)) found.price = `Between ${BUDGET_MIN} and ${BUDGET_MAX} $U, the most one hire can be funded with today.`;
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
      const content: BidContent = { agentChainId: agent.chainId, agentTokenId: agent.tokenId, priceU: Number(price), deliverDays, note: note.trim() };
      const placedAt = new Date().toISOString();
      const signature = await sign(bidMessage({ ...content, briefId, bidder: address, placedAt }));
      const response = await fetch(`/api/briefs/${briefId}/bids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bidder: address, signature, placedAt, content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The proposal was not sent.');
      setSent(true);
      setStep('write');
      setNote('');
      setPrice('');
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
      <div className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5">
        <span className="t-label">Review your proposal</span>
        <AgentLine agent={agent} />
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-rule bg-rule">
          <div className="bg-raised px-4 py-3">
            <dt className="text-[12px] text-ink-3">Price</dt>
            <dd className="t-readout text-[15px]">{Number(price).toFixed(2)} $U</dd>
          </div>
          <div className="bg-raised px-4 py-3">
            <dt className="text-[12px] text-ink-3">Delivery</dt>
            <dd className={cn('text-[13.5px] font-medium', later && 'text-watch')}>
              Within {days(deliverDays)} of hiring{later ? ` · request asks ${days(requestDays)}` : ''}
            </dd>
          </div>
        </dl>
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{note.trim()}</p>
        {!ownsAgent && (
          <Notice tone="watch" title="Connect the agent’s owner to send">
            {agent.owner
              ? `The registry names ${shortAddress(agent.owner)} as this agent’s owner, and only that wallet can sign its proposal. Your proposal stays here while you switch.`
              : 'Only the wallet the registry names as this agent’s owner can sign its proposal.'}
          </Notice>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex flex-col-reverse gap-3 border-t border-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button intent="secondary" size="s" onClick={() => setStep('write')} disabled={busy} icon={<Icon.ChevronLeft size={14} />}>
            Edit
          </Button>
          <span className="flex flex-col items-stretch gap-1 sm:items-end">
            <Button onClick={send} busy={busy} disabled={Boolean(address) && !ownsAgent}>
              {busy ? 'Approve in your wallet' : address ? 'Sign and send' : 'Connect a wallet to send'}
            </Button>
            <span className="text-[12px] text-ink-3">A signature, not a transaction. No fee.</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-[14px] border border-rule bg-raised p-5">
      <div className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between gap-3 text-sm font-medium">
          Your agent
          {!agent && (
            <button type="button" onClick={() => setManual((m) => !m)} className="text-[12.5px] font-normal text-ink-3 underline-offset-2 hover:text-ink hover:underline">
              {manual ? 'Choose from my agents' : 'Add by agent ID'}
            </button>
          )}
        </span>
        {agent ? (
          <div className="flex items-center gap-3 rounded-[12px] border border-ink bg-raised p-3">
            <AgentLine agent={agent} />
            <Button size="s" intent="ghost" onClick={() => setAgent(null)}>
              Change
            </Button>
          </div>
        ) : manual ? (
          <AddById onFound={(found) => setAgent(found)} />
        ) : address ? (
          <MyAgents owner={address} onPick={setAgent} onManual={() => setManual(true)} />
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-[12px] border border-dashed border-rule-strong p-4">
            <p className="text-[13.5px] text-ink-2">Connect the wallet that owns your agent to choose it from your list.</p>
            <Button size="s" onClick={() => openConnect('to choose one of your agents')} icon={<Icon.Wallet size={14} />}>
              Connect wallet
            </Button>
          </div>
        )}
        {problems.agent && !agent && <p className="text-[13px] text-bad">{problems.agent}</p>}
      </div>

      <Field label="How it will do the work" hint="The approach and what it will deliver, in a few sentences. Say here if you would change anything in the request." error={problems.note}>
        {(p) => <Textarea {...p} value={note} maxLength={1200} onChange={(e) => setNote(e.target.value)} className="min-h-28" />}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Your price" hint={`The request proposes ${requestBudgetU.toFixed(2)} $U. Up to ${BUDGET_MAX} $U.`} error={problems.price}>
          {(p) => (
            <div className="relative">
              <Input {...p} value={price} inputMode="decimal" onChange={(e) => setPrice(decimalOnly(e.target.value))} placeholder={requestBudgetU.toFixed(2)} className="t-readout pr-12" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">$U</span>
            </div>
          )}
        </Field>
        <Field
          label="Delivery"
          hint={later ? <span className="font-medium text-watch">Later than the {days(requestDays)} this request asks for.</span> : `The request asks for ${days(requestDays)}.`}
        >
          {(p) => (
            <Select {...p} value={deliverDays} onChange={(e) => setDeliverDays(Number(e.target.value))}>
              {DELIVERY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Within {days(d)} of hiring
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="flex justify-end border-t border-rule pt-4">
        <Button onClick={review} trailing={<Icon.Arrow size={15} />}>
          Review proposal
        </Button>
      </div>
    </div>
  );
}

function AgentLine({ agent }: { agent: Agent }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <AgentAvatar name={agent.name} imageUrl={agent.imageUrl} seed={`${agent.chainId}:${agent.tokenId}`} size={36} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] font-medium">{agent.name}</span>
        <span className="truncate text-[12px] text-ink-3">
          #{agent.tokenId} · {agent.chainId === 56 ? 'BNB Chain' : 'BNB Testnet'} · {agent.category ?? 'No category'}
        </span>
      </span>
    </span>
  );
}

/** The connected wallet's agents, searchable once there are enough to need it. */
function MyAgents({ owner, onPick, onManual }: { owner: string; onPick: (agent: Agent) => void; onManual: () => void }) {
  const [query, setQuery] = useState('');
  const owned = useQuery({
    queryKey: ['owned-agents', owner],
    queryFn: async () => {
      const r = await fetch(`/api/builders/agents?address=${owner}`, { cache: 'no-store' });
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

  if (owned.isPending) return <Skeleton className="h-28 w-full" />;
  if (owned.isError) {
    /* A failed read is never shown as "you have no agents". */
    return (
      <Notice tone="watch" title="Your agents could not be listed" action={<Button size="s" intent="secondary" onClick={() => void owned.refetch()} busy={owned.isFetching}>Retry</Button>}>
        {(owned.error as Error).message} You can also add one by its ID.
      </Notice>
    );
  }
  if (owned.data.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-[12px] border border-dashed border-rule-strong p-4">
        <p className="text-[13.5px] text-ink-2">{shortAddress(owner)} owns no agents on BNB Chain or testnet.</p>
        <span className="flex flex-wrap gap-2">
          <Button size="s" intent="secondary" onClick={onManual}>
            Add by agent ID
          </Button>
          <Link href="/build/new" className="inline-flex h-8 items-center px-2 text-[13px] text-ink-2 hover:text-ink">
            Create an agent
          </Link>
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {owned.data.length > 4 && (
        <label className="relative">
          <span className="sr-only">Search your agents</span>
          <Icon.Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your agents"
            className="h-10 w-full rounded-[9px] border border-rule-strong bg-raised pl-9 pr-3 text-[14px] placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
        </label>
      )}
      <ul role="listbox" aria-label="Your agents" className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {agents.map((a) => (
          <li key={`${a.chainId}:${a.tokenId}`}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onPick({ ...a, owner })}
              className="flex w-full items-center gap-3 rounded-[10px] border border-rule p-2.5 text-left transition-colors hover:border-ink-3 hover:bg-sunken/50"
            >
              <AgentLine agent={a} />
              <Icon.ChevronRight size={15} className="shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
        {agents.length === 0 && <li className="px-1 py-2 text-[13px] text-ink-3">No agent matches “{query}”.</li>}
      </ul>
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Network" size="s" value={chain} onChange={setChain} options={[{ value: '56', label: 'BNB Chain' }, { value: '97', label: 'Testnet' }]} />
        <input
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void find()}
          inputMode="numeric"
          placeholder="Agent ID, e.g. 2618"
          aria-label="Agent ID"
          className="t-readout h-9 w-44 rounded-[9px] border border-rule-strong bg-raised px-3 text-[14px] placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <Button size="s" intent="secondary" onClick={find} busy={busy}>
          Find agent
        </Button>
      </div>
      {error && <p className="text-[13px] text-bad">{error}</p>}
    </div>
  );
}

/** Digits and one decimal point. */
function decimalOnly(value: string): string {
  const [whole, ...rest] = value.replace(/[^\d.]/g, '').split('.');
  return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
}
