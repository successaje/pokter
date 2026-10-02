'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Erc8004RegistrationFile } from '@altananetwork/sdk';

import { CATEGORIES } from '@/lib/agents/categories';
import {
  readIdentityRegistration,
  updateIdentityFromWallet,
  type ProfileUpdateStep,
  type RegistryChainId,
} from '@/lib/registry/register';
import { Sheet } from '@/components/ui/Sheet';

type ManagedFile = Erc8004RegistrationFile & {
  categories?: string[];
  tags?: string[];
  active?: boolean;
  x402Support?: boolean;
  supportedTrust?: string[];
};

type EditableProfile = {
  name: string;
  description: string;
  image: string;
  protocol: 'a2a' | 'mcp';
  endpoint: string;
  category: string;
};

function editable(file: ManagedFile): EditableProfile {
  const service = file.services[0];
  const protocol = service?.name.toLowerCase() === 'mcp' ? 'mcp' : 'a2a';
  return {
    name: file.name ?? '', description: file.description ?? '', image: file.image ?? '',
    protocol, endpoint: service?.endpoint ?? '',
    category: file.categories?.[0] ?? file.tags?.[0] ?? '',
  };
}

function label(step: ProfileUpdateStep | null) {
  if (step === 'connecting') return 'Connecting wallet…';
  if (step === 'switching-network') return 'Checking network…';
  if (step === 'updating-profile') return 'Approve profile update…';
  if (step === 'verifying') return 'Verifying onchain record…';
  if (step === 'done') return 'Profile updated';
  return 'Approve profile update';
}

export function AgentProfileEditor({ chainId, tokenId }: { chainId: RegistryChainId; tokenId: string }) {
  const [originalFile, setOriginalFile] = useState<ManagedFile | null>(null);
  const [original, setOriginal] = useState<EditableProfile | null>(null);
  const [draft, setDraft] = useState<EditableProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [endpointBusy, setEndpointBusy] = useState(false);
  const [endpointPassed, setEndpointPassed] = useState<string | null>(null);
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [updateStep, setUpdateStep] = useState<ProfileUpdateStep | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    let active = true;
    readIdentityRegistration(chainId, tokenId).then(({ file }) => {
      if (!active) return;
      const managed = file as ManagedFile;
      const profile = editable(managed);
      setOriginalFile(managed); setOriginal(profile); setDraft(profile); setLoading(false);
    }).catch((reason) => {
      if (!active) return;
      setLoadError(reason instanceof Error ? reason.message : 'The onchain profile could not be loaded.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [chainId, tokenId]);

  const changes = useMemo(() => {
    if (!original || !draft) return [] as Array<{ label: string; before: string; after: string }>;
    return ([
      ['Name', original.name, draft.name], ['Description', original.description, draft.description],
      ['Image', original.image, draft.image], ['Protocol', original.protocol.toUpperCase(), draft.protocol.toUpperCase()],
      ['Endpoint', original.endpoint, draft.endpoint], ['Outcome', original.category, draft.category],
    ] as const).filter(([, before, after]) => before !== after).map(([itemLabel, before, after]) => ({ label: itemLabel, before, after }));
  }, [original, draft]);

  if (loading) return <div className="mt-6 flex items-center gap-3 rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-4 text-[11px] text-[color:var(--text-muted)]"><span className="size-4 animate-spin rounded-full border-2 border-[color:var(--border-strong)] border-t-[color:var(--brand)]"/>Loading the exact onchain profile…</div>;
  if (loadError || !draft || !original || !originalFile) return <p className="mt-6 rounded-[var(--radius)] border border-[color:var(--caution)]/30 bg-[color:var(--caution-dim)] p-4 text-[12px] leading-5 text-[color:var(--caution)]">{loadError ?? 'The structured profile is unavailable.'}</p>;

  const normalizedEndpoint = draft.endpoint.trim();
  const endpointChanged = normalizedEndpoint !== original.endpoint.trim() || draft.protocol !== original.protocol;
  const endpointReady = !endpointChanged || endpointPassed === `${draft.protocol}:${normalizedEndpoint}`;
  const valid = draft.name.trim().length >= 3 && draft.name.trim().length <= 80
    && draft.description.trim().length >= 40 && draft.description.trim().length <= 600
    && /^https:\/\//i.test(normalizedEndpoint) && /^https:\/\//i.test(draft.image.trim())
    && Boolean(draft.category) && endpointReady && changes.length > 0;

  function update<K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setUpdated(false); setUpdateError(null);
    if (key === 'endpoint' || key === 'protocol') {
      setEndpointPassed(null); setEndpointError(null);
    }
  }

  async function testEndpoint() {
    if (!draft) return;
    setEndpointBusy(true); setEndpointError(null); setEndpointPassed(null);
    try {
      const response = await fetch('/api/builders/preflight', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: draft.endpoint.trim(), protocol: draft.protocol }),
      });
      const payload = await response.json() as { ok?: boolean; detail?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? payload.detail ?? 'The endpoint did not pass the protocol handshake.');
      setEndpointPassed(`${draft.protocol}:${draft.endpoint.trim()}`);
    } catch (reason) {
      setEndpointError(reason instanceof Error ? reason.message : 'The endpoint could not be tested.');
    } finally { setEndpointBusy(false); }
  }

  async function submitUpdate() {
    if (!valid || !draft || !originalFile) return;
    setUpdateError(null); setUpdated(false);
    const nextFile = {
      ...originalFile,
      name: draft.name.trim(), description: draft.description.trim(), image: draft.image.trim(),
      services: [{ ...(originalFile.services[0] ?? {}), name: draft.protocol.toUpperCase(), endpoint: draft.endpoint.trim() }],
      tags: [draft.category], categories: [draft.category],
    } as ManagedFile;
    try {
      await updateIdentityFromWallet({ chainId, agentId: tokenId, file: nextFile, onProgress: setUpdateStep });
      const saved = editable(nextFile);
      setOriginalFile(nextFile); setOriginal(saved); setDraft(saved); setUpdated(true); setUpdateStep('done');
    } catch (reason) {
      setUpdateError(reason instanceof Error ? reason.message : 'The profile could not be updated.');
      setUpdateStep(null);
    }
  }

  const busy = updateStep !== null && updateStep !== 'done';
  return (
    <div className="mt-7 border-t border-[color:var(--border)] pt-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">Owner controls</p><h3 className="mt-1 text-lg font-semibold">Maintain the public profile</h3><p className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">Changes are tested locally, compared clearly, and written only after your wallet approves.</p></div><Link href={`/agents/${chainId}/${tokenId}`} className="text-[12px] font-medium text-[color:var(--brand-strong)]">View current public page ↗</Link></div>
      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-2"><span className="text-[12px] font-medium">Name</span><input maxLength={80} value={draft.name} onChange={(event) => update('name', event.target.value)} className="h-11 min-w-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px] outline-none focus:border-[color:var(--border-focus)]"/></label>
        <label className="flex min-w-0 flex-col gap-2"><span className="text-[12px] font-medium">Financial outcome</span><select value={draft.category} onChange={(event) => update('category', event.target.value)} className="h-11 min-w-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px]"><option value="">Choose an outcome</option>{CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
        <label className="flex min-w-0 flex-col gap-2 sm:col-span-2"><span className="text-[12px] font-medium">Description</span><textarea rows={4} maxLength={600} value={draft.description} onChange={(event) => update('description', event.target.value)} className="resize-none rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-3 text-[12px] leading-5 outline-none focus:border-[color:var(--border-focus)]"/><span className="text-right text-[12px] text-[color:var(--text-muted)]">{draft.description.length}/600</span></label>
        <label className="flex min-w-0 flex-col gap-2"><span className="text-[12px] font-medium">Protocol</span><select value={draft.protocol} onChange={(event) => update('protocol', event.target.value as 'a2a' | 'mcp')} className="h-11 min-w-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px]"><option value="a2a">A2A</option><option value="mcp">MCP</option></select></label>
        <div className="min-w-0"><label htmlFor="managed-endpoint" className="text-[12px] font-medium">Endpoint</label><div className="mt-2 flex min-w-0 gap-2"><input id="managed-endpoint" maxLength={2048} value={draft.endpoint} onChange={(event) => update('endpoint', event.target.value)} className="h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px]"/><button type="button" onClick={testEndpoint} disabled={endpointBusy || !/^https:\/\//i.test(draft.endpoint)} className="shrink-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 text-[12px] font-semibold disabled:opacity-40">{endpointBusy ? 'Testing…' : endpointReady ? 'Retest' : 'Test'}</button></div></div>
        <label className="flex min-w-0 flex-col gap-2 sm:col-span-2"><span className="text-[12px] font-medium">Image URL</span><input maxLength={2048} value={draft.image} onChange={(event) => update('image', event.target.value)} className="h-11 min-w-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px]"/></label>
      </div>
      {endpointError && <p role="alert" className="mt-3 rounded-[var(--radius)] bg-[color:var(--caution-dim)] p-3 text-[12px] text-[color:var(--caution)]">{endpointError}</p>}
      {endpointPassed && <p className="mt-3 text-[12px] font-medium text-[color:var(--positive)]">✓ Proposed endpoint passed the live protocol handshake.</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-[12px] text-[color:var(--text-muted)]">{changes.length ? `${changes.length} proposed change${changes.length === 1 ? '' : 's'}` : 'No changes yet'}</p><button type="button" disabled={!valid} onClick={() => setReviewOpen(true)} className="action-primary rounded-[var(--radius)] px-4 py-2.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">Review update</button></div>

      <Sheet open={reviewOpen} onClose={() => { if (!busy) setReviewOpen(false); }} title={updated ? 'Profile updated' : 'Review profile update'} description={updated ? `Agent #${tokenId} was verified against the registry.` : `Only agent #${tokenId} on chain ${chainId} will change.`} footer={!updated ? <button type="button" disabled={busy} onClick={submitUpdate} className="action-primary w-full rounded-[var(--radius)] px-4 py-3 text-[12px] font-semibold disabled:opacity-50">{busy && <span className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"/>}{label(updateStep)}</button> : undefined}>
        {updated ? <div className="rounded-[var(--radius)] bg-[color:var(--positive-dim)] p-5"><p className="text-sm font-semibold text-[color:var(--positive)]">The exact approved profile is live.</p><Link href={`/agents/${chainId}/${tokenId}`} className="action-primary mt-4 flex min-h-11 items-center justify-center rounded-[var(--radius)] px-4 text-[11px] font-semibold">Open public profile</Link></div> : <div className="flex flex-col gap-3">{changes.map((change) => <div key={change.label} className="rounded-[var(--radius)] border border-[color:var(--border)] p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">{change.label}</p><div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2"><p className="min-w-0 break-words text-[12px] leading-4 text-[color:var(--text-muted)]"><span className="block text-[10px] uppercase">Current</span>{change.before || 'Not set'}</p><p className="min-w-0 break-words text-[12px] leading-4"><span className="block text-[10px] uppercase text-[color:var(--brand-strong)]">Proposed</span>{change.after || 'Removed'}</p></div></div>)}<p className="rounded-[var(--radius)] bg-[color:var(--info-dim)] p-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">Your wallet will request one <span className="mono">setAgentURI</span> transaction on {chainId === 56 ? 'BNB Chain' : 'BNB Testnet'}. Pokter verifies ownership again immediately before sending it.</p>{updateError && <p role="alert" className="rounded-[var(--radius)] bg-[color:var(--caution-dim)] p-3 text-[12px] text-[color:var(--caution)]">{updateError}</p>}</div>}
      </Sheet>
    </div>
  );
}
