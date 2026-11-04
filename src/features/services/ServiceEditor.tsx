'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { CATEGORIES } from '@/lib/agents/categories';
import { serviceMessage, type Service, type ServiceContent } from '@/lib/services/model';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { NetworkStageTag } from '@/ui/Network';

export function ServiceEditor({ builder, agents, initial = null, previewContent }: { builder: string; agents: Array<{ key: string; name: string }>; initial?: Service | null; previewContent?: ServiceContent }) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const { chain } = useAccount();
  const [agentKey, setAgentKey] = useState(initial ? `${initial.chainId}:${initial.tokenId}` : agents[0]?.key ?? '');
  const [draft, setDraft] = useState({ title: initial?.title ?? previewContent?.title ?? '', description: initial?.description ?? previewContent?.description ?? '', buyerProvides: initial?.buyerProvides ?? previewContent?.buyerProvides ?? '', delivers: initial?.delivers ?? previewContent?.delivers ?? '', category: initial?.category ?? previewContent?.category ?? CATEGORIES[0].id, status: initial?.status ?? 'active' });
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
  const field = (key: 'description' | 'buyerProvides' | 'delivers', label: string, rows: number) => <label className="flex flex-col gap-1.5 text-sm font-medium">{label}<textarea required maxLength={key === 'description' ? 800 : 500} minLength={key === 'description' ? 20 : 1} rows={rows} value={draft[key]} onChange={(event) => { setDraft((d) => ({ ...d, [key]: event.target.value })); setReview(false); }} className="rounded-[9px] border border-rule-strong bg-paper p-3 text-sm font-normal" /></label>;
  return <form onSubmit={(event) => { event.preventDefault(); if (!review) { setReview(true); return; } if (!previewContent) void save(); }} className="mt-7 flex max-w-3xl flex-col gap-5 rounded-[14px] border border-rule bg-raised p-5 sm:p-7">
    {error && <p role="alert" className="rounded-[8px] border border-red-500 p-3 text-sm">{error}</p>}
    <label className="flex flex-col gap-1.5 text-sm font-medium">Agent<select value={agentKey} disabled={Boolean(initial)} onChange={(event) => { setAgentKey(event.target.value); setReview(false); }} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm">{agents.map((agent) => <option key={agent.key} value={agent.key}>{agent.name} · BNB {agent.key.startsWith('56:') ? 'Mainnet' : 'Testnet'}</option>)}</select></label>
    <div className="-mt-2 flex items-center gap-2 text-[12px] text-ink-3">Hire network <NetworkStageTag chainId={agentKey ? Number(key[0]) : null} /></div>
    <label className="flex flex-col gap-1.5 text-sm font-medium">Service title<input required minLength={4} maxLength={100} value={draft.title} onChange={(event) => { setDraft((d) => ({ ...d, title: event.target.value })); setReview(false); }} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm font-normal" placeholder="A specific task buyers can understand" /></label>
    {field('description', 'What this service covers', 4)}
    <div className="grid gap-5 sm:grid-cols-2">{field('buyerProvides', 'What the buyer provides', 4)}{field('delivers', 'What the agent delivers', 4)}</div>
    <label className="flex flex-col gap-1.5 text-sm font-medium">Category<select value={draft.category} onChange={(event) => { setDraft((d) => ({ ...d, category: event.target.value })); setReview(false); }} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm">{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    {initial && <label className="flex flex-col gap-1.5 text-sm font-medium">Availability<select value={draft.status} onChange={(event) => { setDraft((d) => ({ ...d, status: event.target.value as ServiceContent['status'] })); setReview(false); }} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm"><option value="active">Published</option><option value="paused">Paused</option><option value="archived">Archive permanently</option></select></label>}
    <p className="text-xs leading-relaxed text-ink-3">This offer is self-provided. It does not set a fixed price or guarantee delivery. The buyer requests a fresh agent-signed quote for their exact brief before hiring.</p>
    {review && <div className="rounded-[9px] border border-rule-strong bg-paper p-4 text-sm"><strong>{previewContent ? 'Sample review' : 'Review before signing'}</strong><div className="mt-2 flex flex-wrap items-center gap-2"><span>{content.title} · Agent #{content.tokenId}</span><NetworkStageTag chainId={content.chainId} /><span className="text-ink-3">{content.status}</span></div><p className="mt-2 text-ink-2">{previewContent ? 'This local sample cannot be signed or published.' : 'Publishing makes this scope public. Edits create a new revision; old revisions remain stored.'}</p></div>}
    <button disabled={busy || !agents.length || (Boolean(previewContent) && review)} className="self-start rounded-[9px] bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-50">{busy ? 'Saving…' : review ? previewContent ? 'Preview only — nothing published' : 'Sign and save service' : 'Review service'}</button>
  </form>;
}
