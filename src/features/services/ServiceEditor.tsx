'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { CATEGORIES } from '@/lib/agents/categories';
import { serviceMessage, type Service, type ServiceContent } from '@/lib/services/model';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';

export function ServiceEditor({ builder, agents, initial = null }: { builder: string; agents: Array<{ key: string; name: string }>; initial?: Service | null }) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const { chain } = useAccount();
  const [agentKey, setAgentKey] = useState(initial ? `${initial.chainId}:${initial.tokenId}` : agents[0]?.key ?? '');
  const [draft, setDraft] = useState({ title: initial?.title ?? '', description: initial?.description ?? '', buyerProvides: initial?.buyerProvides ?? '', delivers: initial?.delivers ?? '', category: initial?.category ?? CATEGORIES[0].id, status: initial?.status ?? 'active' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const key = agentKey.split(':');
  const content: ServiceContent = { ...draft, chainId: Number(key[0]) as 56 | 97, tokenId: key[1] ?? '', status: draft.status as ServiceContent['status'] };
  const save = async () => {
    if (!address || address.toLowerCase() !== builder.toLowerCase() || !canSign) { setError('Connect the builder wallet to publish this service.'); return; }
    if (chain?.id !== content.chainId) { setError(`Switch your wallet to BNB ${content.chainId === 56 ? 'Mainnet' : 'Testnet'} to sign this service.`); return; }
    setBusy(true); setError(null);
    try {
      const challengeResponse = await fetch('/api/profiles', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: builder, chainId: content.chainId }) });
      const challengePayload = await challengeResponse.json() as { challenge?: { id: string; suffix: string }; error?: string };
      if (!challengeResponse.ok || !challengePayload.challenge) throw new Error(challengePayload.error ?? 'Could not prepare signature.');
      const signature = await sign(serviceMessage(builder, challengePayload.challenge.suffix, initial?.id ?? null, content));
      const response = await fetch('/api/services', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ builder, signature, challengeId: challengePayload.challenge.id, id: initial?.id ?? null, content }) });
      const payload = await response.json() as { service?: Service; error?: string };
      if (!response.ok || !payload.service) throw new Error(payload.error ?? 'The service was not saved.');
      router.push(`/services/${payload.service.id}`); router.refresh();
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  };
  const field = (key: 'title' | 'description' | 'buyerProvides' | 'delivers', label: string, rows: number) => <label className="flex flex-col gap-1.5 text-sm font-medium">{label}<textarea required maxLength={key === 'title' ? 100 : key === 'description' ? 800 : 500} minLength={key === 'description' ? 20 : 1} rows={rows} value={draft[key]} onChange={(event) => { setDraft((d) => ({ ...d, [key]: event.target.value })); setReview(false); }} className="rounded-[9px] border border-rule-strong bg-paper p-3 text-sm font-normal" /></label>;
  return <form onSubmit={(event) => { event.preventDefault(); if (!review) { setReview(true); return; } void save(); }} className="mt-8 flex max-w-2xl flex-col gap-5 rounded-[14px] border border-rule bg-raised p-5 sm:p-8">
    {error && <p role="alert" className="rounded-[8px] border border-red-500 p-3 text-sm">{error}</p>}
    <label className="flex flex-col gap-1.5 text-sm font-medium">Agent<select value={agentKey} disabled={Boolean(initial)} onChange={(event) => { setAgentKey(event.target.value); setReview(false); }} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm">{agents.map((agent) => <option key={agent.key} value={agent.key}>{agent.name} · BNB {agent.key.startsWith('56:') ? 'Mainnet' : 'Testnet'}</option>)}</select></label>
    {field('title', 'Service title', 2)}{field('description', 'What this service covers', 5)}{field('buyerProvides', 'What the buyer provides', 4)}{field('delivers', 'What the agent delivers', 4)}
    <label className="flex flex-col gap-1.5 text-sm font-medium">Category<select value={draft.category} onChange={(event) => setDraft((d) => ({ ...d, category: event.target.value }))} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm">{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    {initial && <label className="flex flex-col gap-1.5 text-sm font-medium">Availability<select value={draft.status} onChange={(event) => setDraft((d) => ({ ...d, status: event.target.value as ServiceContent['status'] }))} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm"><option value="active">Published</option><option value="paused">Paused</option><option value="archived">Archive permanently</option></select></label>}
    <p className="text-xs leading-relaxed text-ink-3">This offer is self-provided. It does not set a fixed price or guarantee delivery. The buyer requests a fresh agent-signed quote for their exact brief before hiring.</p>
    {review && <div className="rounded-[9px] border border-rule-strong bg-paper p-4 text-sm"><strong>Review before signing</strong><p className="mt-2">{content.title} · Agent #{content.tokenId} · BNB {content.chainId === 56 ? 'Mainnet' : 'Testnet'} · {content.status}</p><p className="mt-2 text-ink-2">Publishing makes this scope public. Edits create a new revision; old revisions remain stored.</p></div>}
    <button disabled={busy || !agents.length} className="self-start rounded-[9px] bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-50">{busy ? 'Saving…' : review ? 'Sign and save service' : 'Review service'}</button>
  </form>;
}
