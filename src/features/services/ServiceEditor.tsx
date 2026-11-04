'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { CATEGORIES } from '@/lib/agents/categories';
import { parseService, serviceMessage, type Service, type ServiceContent } from '@/lib/services/model';
import { WALLET_NETWORK } from '@/lib/wallet/passkey';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { useLiveSignMessage } from '@/lib/wallet/use-live-sign-message';
import { useLiveSwitchChain } from '@/lib/wallet/use-live-switch-chain';
import { NetworkStageTag } from '@/ui/Network';

export function ServiceEditor({ builder, agents, initial = null, previewContent }: { builder: string; agents: Array<{ key: string; name: string }>; initial?: Service | null; previewContent?: ServiceContent }) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const { address: browserAddress, isConnected, chain } = useAccount();
  const { signMessageAsync } = useLiveSignMessage();
  const { switchChainAsync } = useLiveSwitchChain();
  const [agentKey, setAgentKey] = useState(initial ? `${initial.chainId}:${initial.tokenId}` : agents[0]?.key ?? '');
  const [draft, setDraft] = useState({ title: initial?.title ?? previewContent?.title ?? '', description: initial?.description ?? previewContent?.description ?? '', buyerProvides: initial?.buyerProvides ?? previewContent?.buyerProvides ?? '', delivers: initial?.delivers ?? previewContent?.delivers ?? '', category: initial?.category ?? previewContent?.category ?? CATEGORIES[0].id, status: initial?.status ?? 'active' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const key = agentKey.split(':');
  const content: ServiceContent = { ...draft, chainId: Number(key[0]) as 56 | 97, tokenId: key[1] ?? '', status: draft.status as ServiceContent['status'] };
  const save = async () => {
    const canonical = parseService(content);
    if (!canonical) { setError('Complete the service details before signing.'); return; }
    const browserOwnsProfile = Boolean(isConnected && browserAddress?.toLowerCase() === builder.toLowerCase());
    if (!browserOwnsProfile && (!address || address.toLowerCase() !== builder.toLowerCase() || !canSign)) { setError('Connect the builder wallet to publish this service.'); return; }
    setBusy(true); setError(null);
    try {
      if (browserOwnsProfile && chain?.id !== canonical.chainId) await switchChainAsync({ chainId: canonical.chainId });
      else if (!browserOwnsProfile && WALLET_NETWORK.chainId !== canonical.chainId) throw new Error(`This passkey wallet cannot publish on BNB ${canonical.chainId === 56 ? 'Mainnet' : 'Testnet'}. Connect the builder's browser wallet on that network.`);
      const challengeResponse = await fetch('/api/profiles', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: builder, chainId: canonical.chainId }) });
      const challengePayload = await challengeResponse.json() as { challenge?: { id: string; suffix: string }; error?: string };
      if (!challengeResponse.ok || !challengePayload.challenge) throw new Error(challengePayload.error ?? 'Could not prepare signature.');
      const message = serviceMessage(builder, challengePayload.challenge.suffix, initial?.id ?? null, canonical);
      const signature = browserOwnsProfile ? await signMessageAsync({ message }) : await sign(message);
      const response = await fetch('/api/services', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ builder, signature, challengeId: challengePayload.challenge.id, id: initial?.id ?? null, content: canonical }) });
      const payload = await response.json() as { service?: Service; error?: string };
      if (!response.ok || !payload.service) throw new Error(payload.error ?? 'The service was not saved.');
      router.push(`/services/${payload.service.id}`); router.refresh();
    } catch (caught) { const message = (caught as Error).message || 'The service was not saved.'; setError(/reject|denied/i.test(message) ? 'You declined the wallet request. Nothing was published.' : message); }
    finally { setBusy(false); }
  };
  const field = (key: 'description' | 'buyerProvides' | 'delivers', label: string, rows: number) => <label className="flex flex-col gap-1.5 text-sm font-medium">{label}<textarea required maxLength={key === 'description' ? 800 : 500} minLength={key === 'description' ? 20 : 1} rows={rows} value={draft[key]} onChange={(event) => { setDraft((d) => ({ ...d, [key]: event.target.value })); setReview(false); setError(null); }} className="rounded-[9px] border border-rule-strong bg-paper p-3 text-sm font-normal" /></label>;
  return <form onSubmit={(event) => { event.preventDefault(); if (!review) { setReview(true); return; } if (!previewContent) void save(); }} className="mt-7 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-start">
    <div className="flex min-w-0 flex-col gap-5 rounded-[14px] border border-rule bg-raised p-5 sm:p-7">
    <label className="flex flex-col gap-1.5 text-sm font-medium">Agent<select value={agentKey} disabled={Boolean(initial)} onChange={(event) => { setAgentKey(event.target.value); setReview(false); setError(null); }} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm">{agents.map((agent) => <option key={agent.key} value={agent.key}>{agent.name} · BNB {agent.key.startsWith('56:') ? 'Mainnet' : 'Testnet'}</option>)}</select></label>
    <div className="-mt-2 flex items-center gap-2 text-[12px] text-ink-3">Hire network <NetworkStageTag chainId={agentKey ? Number(key[0]) : null} /></div>
    <label className="flex flex-col gap-1.5 text-sm font-medium">Service title<input required minLength={4} maxLength={100} value={draft.title} onChange={(event) => { setDraft((d) => ({ ...d, title: event.target.value })); setReview(false); setError(null); }} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm font-normal" placeholder="A specific task buyers can understand" /></label>
    {field('description', 'What this service covers', 4)}
    <div className="grid gap-5 sm:grid-cols-2">{field('buyerProvides', 'What the buyer provides', 4)}{field('delivers', 'What the agent delivers', 4)}</div>
    <label className="flex flex-col gap-1.5 text-sm font-medium">Category<select value={draft.category} onChange={(event) => { setDraft((d) => ({ ...d, category: event.target.value })); setReview(false); setError(null); }} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm">{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    {initial && <label className="flex flex-col gap-1.5 text-sm font-medium">Availability<select value={draft.status} onChange={(event) => { setDraft((d) => ({ ...d, status: event.target.value as ServiceContent['status'] })); setReview(false); setError(null); }} className="h-11 rounded-[9px] border border-rule-strong bg-paper px-3 text-sm"><option value="active">Published</option><option value="paused">Paused</option><option value="archived">Archive permanently</option></select></label>}
    </div>
    <aside className="min-w-0 rounded-[14px] border border-rule bg-raised p-5 sm:p-6 lg:sticky lg:top-24" aria-label="Service review">
      <span className="t-label">{previewContent ? 'Sample review' : 'Review before signing'}</span>
      <h2 className="mt-2 break-words text-[19px] font-semibold leading-snug">{draft.title.trim() || 'Your service'}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2"><span>{agents.find((agent) => agent.key === agentKey)?.name ?? 'Choose an agent'}</span><NetworkStageTag chainId={agentKey ? content.chainId : null} /></div>
      {review ? <dl className="mt-5 space-y-4 border-t border-rule pt-4 text-[13px]">
        <div><dt className="t-label">Scope</dt><dd className="mt-1 whitespace-pre-wrap break-words text-ink-2">{draft.description.trim()}</dd></div>
        <div><dt className="t-label">Buyer provides</dt><dd className="mt-1 whitespace-pre-wrap break-words text-ink-2">{draft.buyerProvides.trim()}</dd></div>
        <div><dt className="t-label">Agent delivers</dt><dd className="mt-1 whitespace-pre-wrap break-words text-ink-2">{draft.delivers.trim()}</dd></div>
      </dl> : <p className="mt-5 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-3">Complete the fields, then review the public offer here before signing.</p>}
      <p className="mt-5 text-[12px] leading-relaxed text-ink-3">{previewContent ? 'This local sample cannot be signed or published.' : 'This offer is self-provided. It sets no fixed price or delivery guarantee. Buyers request a fresh agent-signed quote before hiring.'}</p>
      {error && <p role="alert" className="mt-4 rounded-[8px] border border-bad/35 bg-bad-wash p-3 text-[13px] text-bad">{error}</p>}
      <button disabled={busy || !agents.length || (Boolean(previewContent) && review)} className="mt-5 w-full rounded-[9px] bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-50">{busy ? 'Saving…' : review ? previewContent ? 'Preview only — nothing published' : 'Sign and save service' : 'Review service'}</button>
      {review && !previewContent && <p className="mt-2 text-center text-[11.5px] text-ink-3">Your wallet will switch to this agent&apos;s network if needed.</p>}
    </aside>
  </form>;
}
