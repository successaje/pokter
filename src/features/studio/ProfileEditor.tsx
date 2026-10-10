'use client';

import { useEffect, useState } from 'react';
import type { Erc8004RegistrationFile as SdkFile } from '@altananetwork/sdk';

// The registry file carries optional tags and categories the SDK type omits.
type Erc8004RegistrationFile = SdkFile & { tags?: string[]; categories?: string[] };

import { CATEGORIES } from '@/lib/agents/categories';
import { readIdentityRegistration, updateIdentityFromWallet, type RegistryChainId } from '@/lib/registry/register';
import { Button } from '@/ui/Button';
import { Notice, Skeleton } from '@/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/ui/Field';

/** The one service the editor reads, checks and writes: the first A2A or MCP entry. */
function serviceIndex(f: { services?: Array<{ name: string }> }) {
  return (f.services ?? []).findIndex((s) => /a2a|mcp/i.test(s.name));
}

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id as string));

/** Replace only the marketplace category in a tag list, keeping every other tag. */
function withCategory(list: string[] | undefined, category: string) {
  const rest = (list ?? []).filter((t) => !CATEGORY_IDS.has(t));
  return category ? [category, ...rest] : rest;
}

type Editable = { name: string; description: string; image: string; endpoint: string; category: string };

/**
 * Edit the public ERC-8004 profile. The current file is read from chain,
 * only the fields shown change, everything else in the file is preserved,
 * and an endpoint change must pass the same preflight as a new listing.
 */
export function ProfileEditor({ chainId, tokenId }: { chainId: RegistryChainId; tokenId: string }) {
  const [file, setFile] = useState<Erc8004RegistrationFile | null>(null);
  const [original, setOriginal] = useState<Editable | null>(null);
  const [form, setForm] = useState<Editable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    readIdentityRegistration(chainId, tokenId)
      .then(({ file: raw }) => {
        const f = raw as Erc8004RegistrationFile;
        const index = serviceIndex(f);
        const service = index >= 0 ? f.services![index] : null;
        const e: Editable = { name: f.name ?? '', description: f.description ?? '', image: f.image ?? '', endpoint: service?.endpoint ?? '', category: [...(f.categories ?? []), ...(f.tags ?? [])].find((t) => CATEGORY_IDS.has(t)) ?? '' };
        setFile(f);
        setOriginal(e);
        setForm(e);
        setChecked(e.endpoint);
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [chainId, tokenId]);

  if (loadError) return <Notice tone="watch" title="This profile cannot be edited here">{loadError}</Notice>;
  if (!form || !original || !file) return <Skeleton className="h-64 w-full" />;

  const changed = JSON.stringify(form) !== JSON.stringify(original);
  const endpointOk = form.endpoint === checked;
  const set = (k: keyof Editable, v: string) => {
    setSaved(false);
    setForm({ ...form, [k]: v });
  };

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const index = serviceIndex(file!);
      const protocol = index >= 0 && /mcp/i.test(file!.services![index].name) ? 'mcp' : 'a2a';
      const r = await fetch('/api/builders/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: form!.endpoint.trim(), protocol }) });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; detail?: string; error?: string };
      if (!r.ok || !body.ok) throw new Error(body.error ?? body.detail ?? 'The endpoint did not answer.');
      setChecked(form!.endpoint);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function save() {
    setError(null);
    try {
      const index = serviceIndex(file!);
      const endpoint = form!.endpoint.trim();
      // No A2A/MCP entry yet: add one rather than silently dropping the endpoint.
      const services = index >= 0
        ? (file!.services ?? []).map((s, i) => (i === index ? { ...s, endpoint } : s))
        : endpoint
          ? [{ name: 'A2A', endpoint }, ...(file!.services ?? [])]
          : (file!.services ?? []);
      const next = {
        ...file!,
        name: form!.name.trim(),
        description: form!.description.trim(),
        image: form!.image.trim(),
        services,
        tags: withCategory(file!.tags, form!.category),
        categories: withCategory(file!.categories, form!.category),
      } as Erc8004RegistrationFile;
      const result = await updateIdentityFromWallet({ chainId, agentId: tokenId, file: next, onProgress: (s) => setStep(String(s)) });
      setFile(next);
      setOriginal(form);
      setSaved(!result.unchanged);
    } catch (err) {
      const m = (err as Error).message;
      setError(/reject|denied|cancel/i.test(m) ? 'You declined in the wallet. Nothing changed.' : m);
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Name">{(p) => <Input {...p} value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} />}</Field>
      <Field label="Description">{(p) => <Textarea {...p} value={form.description} maxLength={600} onChange={(e) => set('description', e.target.value)} />}</Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category">
          {(p) => (
            <Select {...p} value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">None</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Image URL">{(p) => <Input {...p} value={form.image} onChange={(e) => set('image', e.target.value)} />}</Field>
      </div>
      <Field label="Endpoint" hint={endpointOk ? 'Unchanged or checked.' : 'Changed: check it before saving.'}>
        {(p) => (
          <div className="flex gap-2">
            <Input {...p} value={form.endpoint} onChange={(e) => set('endpoint', e.target.value)} className="t-readout text-[13.5px]" />
            {!endpointOk && (
              <Button intent="secondary" onClick={() => void check()} busy={checking}>
                Check
              </Button>
            )}
          </div>
        )}
      </Field>
      {error && <Notice tone="bad">{error}</Notice>}
      {saved && <Notice tone="ok">Profile updated on chain. Listings refresh on the next registry index.</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={!changed || !endpointOk} busy={step !== null}>
          {step ? `Saving: ${step.replace(/-/g, ' ')}` : 'Save to chain'}
        </Button>
        <span className="text-[12.5px] text-ink-3">One transaction from the owner&rsquo;s browser wallet.</span>
      </div>
    </div>
  );
}
