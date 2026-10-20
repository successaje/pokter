'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useAccount } from 'wagmi';

import { CATEGORIES, type Category } from '@/lib/agents/categories';
import { isEscrowChain } from '@/lib/network/escrow';
import { CHAIN_ID } from '@/lib/network/presentation';
import {
  avatarSrc,
  handleProblem,
  normalizeProfile,
  PROFILE_LIMITS,
  profileMessage,
  profilePath,
  profileProblem,
  USAGES,
  type ProfileContent,
  type Usage,
} from '@/lib/profiles/model';
import { avatarUrl } from '@/lib/ui/avatar-art';
import { cn } from '@/lib/ui/cn';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { AgentAvatar } from '@/ui/Agent';
import { AvatarImage } from '@/ui/AvatarImage';
import { Button } from '@/ui/Button';
import { Checkbox, Field, Input, Textarea } from '@/ui/Field';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { rememberUsage } from './usage';

export type OwnedAgentOption = { key: string; chainId: number; tokenId: string; name: string; imageUrl: string | null; category: string | null };

/** Signs and saves profile content; shared by the editor and the usage picker. */
export function useSaveProfile(wallet: string) {
  const { sign, canSign } = useActiveSigner();
  const { chain } = useAccount();
  return async (content: ProfileContent): Promise<ProfileContent> => {
    const clean = normalizeProfile(content);
    const problem = profileProblem(clean);
    if (problem) throw new Error(problem);
    if (!canSign) throw new Error('Connect this wallet to sign the change.');
    const signedAt = new Date().toISOString();
    /* The network the wallet is on, so a smart wallet's signature is checked where it lives. */
    const chainId = chain && isEscrowChain(chain.id) ? chain.id : CHAIN_ID;
    const signature = await sign(profileMessage({ ...clean, wallet, signedAt }));
    const response = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, signature, signedAt, chainId, content: clean }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'The profile was not saved.');
    rememberUsage(wallet, clean.usage);
    return clean;
  };
}

function friendly(error: unknown, fallback: string): string {
  const message = (error as Error)?.message || fallback;
  return /reject|denied/i.test(message) ? 'You declined the signature. Nothing changed.' : message;
}

/**
 * Editing a profile, then reviewing exactly what will be public before
 * signing it.
 *
 * Identity, how the person uses Pokter, which parts of their activity
 * the profile shows and which agents it represents, and whether it is
 * published. Nothing becomes public by changing how someone uses Pokter:
 * sections and agents are chosen here, explicitly, and the review step
 * lists them before anything is signed.
 */
export function ProfileEditor({
  wallet,
  initial,
  agents,
  hiringActivity,
  onDone,
}: {
  wallet: string;
  initial: ProfileContent;
  agents: OwnedAgentOption[];
  hiringActivity: { requests: number; jobsFunded: number };
  onDone: () => void;
}) {
  const router = useRouter();
  const save = useSaveProfile(wallet);
  const [draft, setDraft] = useState<ProfileContent>(initial);
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const links = [...draft.links, '', '', ''].slice(0, PROFILE_LIMITS.links);
  const handleIssue = handleProblem(draft.handle.trim().toLowerCase());
  const set = (patch: Partial<ProfileContent>) => setDraft((d) => ({ ...d, ...patch }));
  const chosen = agents.filter((a) => draft.agents.includes(a.key));

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    setUploading(true);
    setError(null);
    try {
      const r = await fetch('/api/profiles/avatar', { method: 'POST', body: picked });
      const body = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok || !body.id) throw new Error(body.error ?? 'The picture was not uploaded.');
      set({ avatar: body.id });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = '';
    }
  };

  const review = () => {
    const problem = profileProblem(normalizeProfile(draft));
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep('review');
    window.scrollTo({ top: 0 });
  };

  const commit = async (content: ProfileContent) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await save(content);
      onDone();
      router.replace(saved.published && saved.handle ? profilePath(wallet, saved.handle) : profilePath(wallet));
      router.refresh();
    } catch (caught) {
      setError(friendly(caught, 'The profile was not saved.'));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'review') {
    const clean = normalizeProfile(draft);
    const exposed = [
      clean.handle && `Handle @${clean.handle}, and the link pokter.xyz/builders/${clean.handle}`,
      clean.displayName && `Name “${clean.displayName}”`,
      clean.avatar ? 'Your uploaded picture' : 'A generated picture',
      clean.bio && 'Your bio',
      clean.tags.length > 0 && `What you build: ${clean.tags.map((t) => CATEGORIES.find((c) => c.id === t)?.label).join(', ')}`,
      clean.links.length > 0 && `${clean.links.length} ${clean.links.length === 1 ? 'link' : 'links'}`,
      clean.usage && `Role: ${USAGES.find((u) => u.id === clean.usage)?.role}`,
      clean.showWallet && 'Your wallet address',
      clean.showBuilding && `Building: ${chosen.length} ${chosen.length === 1 ? 'agent' : 'agents'} you chose, each with its own record and its eligible reviews`,
      clean.showHiring && `Hiring: ${hiringActivity.requests} public ${hiringActivity.requests === 1 ? 'request' : 'requests'} and counts of the ${hiringActivity.jobsFunded} ${hiringActivity.jobsFunded === 1 ? 'job' : 'jobs'} you funded (never amounts)`,
    ].filter(Boolean) as string[];
    return (
      <section aria-labelledby="review-title" className="flex flex-col gap-5 rounded-[18px] border border-ink bg-raised p-6">
        <div className="flex flex-col gap-1">
          <h2 id="review-title" className="text-[19px] font-semibold">
            {clean.published ? 'What will be public' : 'Saved privately'}
          </h2>
          <p className="text-[13.5px] text-ink-2">
            {clean.published ? 'Visitors to your profile will see the following. Everything else stays private.' : 'Not published: visitors will not see your name, bio, picture or choices. They see only what the registry already says about this wallet.'}
          </p>
        </div>
        {clean.published && (
          <ul className="flex flex-col gap-2 rounded-[12px] border border-rule bg-paper p-4 text-[14px]">
            {exposed.map((line) => (
              <li key={line} className="flex gap-2">
                <Icon.Eye size={15} className="mt-0.5 shrink-0 text-ink-3" aria-hidden /> {line}
              </li>
            ))}
          </ul>
        )}
        {clean.published && (
          <div className="flex flex-col gap-3">
            <Notice tone="watch" title="Ownership is public on chain anyway">
              The ERC-8004 registry shows which wallet owns each agent, so anyone can connect your agents to your wallet whatever this page shows. A handle and picture make the profile readable; they do not make you anonymous.
            </Notice>
            <Notice title={clean.indexable ? 'Search engines may index this page' : 'Search indexing off — still public'}>
              {clean.indexable
                ? 'Search engines are asked to list it. Turning this off later asks them to drop it, but they may take time to do so.'
                : 'Search engines are asked not to list it, but the page is still public: anyone with the link can view and share it, and a search engine may not honour a change straight away.'}
            </Notice>
            <p className="text-[12.5px] text-ink-3">Private either way: your email, sign-in details, saved agents, proposals, spending and payment details.</p>
          </div>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex flex-col-reverse gap-3 border-t border-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button intent="secondary" size="s" onClick={() => setStep('edit')} disabled={busy} icon={<Icon.ChevronLeft size={14} />}>
            Edit
          </Button>
          <span className="flex flex-col items-stretch gap-1 sm:items-end">
            <Button onClick={() => void commit(draft)} busy={busy}>
              {busy ? 'Approve in your wallet' : clean.published ? 'Sign and publish' : 'Sign and save privately'}
            </Button>
            <span className="text-[12px] text-ink-3">A signature, not a transaction. No fee.</span>
          </span>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="edit-title" className="flex flex-col gap-7 rounded-[18px] border border-ink bg-raised p-6">
      <div className="flex flex-col gap-1">
        <h2 id="edit-title" className="text-[19px] font-semibold">
          Your profile
        </h2>
        <p className="text-[13px] text-ink-3">What you say here is shown as self-provided. It never changes what Pokter measured about your agents or your jobs.</p>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[15px] font-semibold">Identity</legend>
        <div className="flex items-center gap-4">
          <AvatarImage src={avatarSrc(draft.avatar)} fallback={avatarUrl(wallet.toLowerCase())} name="Your picture" size={72} className="rounded-full" />
          <div className="flex flex-col gap-2">
            <span className="flex flex-wrap gap-2">
              <Button size="s" intent="secondary" onClick={() => file.current?.click()} busy={uploading}>
                Upload picture
              </Button>
              {draft.avatar && (
                <Button size="s" intent="ghost" onClick={() => set({ avatar: '' })}>
                  Use generated
                </Button>
              )}
            </span>
            <span className="text-[12px] text-ink-3">PNG, JPEG or WebP, up to 512 KB.</span>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Upload picture" onChange={(e) => void upload(e.target.files?.[0])} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Handle" hint={`pokter.xyz/builders/${draft.handle.trim().toLowerCase() || 'your-handle'}`} error={draft.handle && handleIssue ? handleIssue : undefined}>
            {(p) => (
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-ink-3">@</span>
                <Input {...p} value={draft.handle} maxLength={PROFILE_LIMITS.handle} onChange={(e) => set({ handle: e.target.value.toLowerCase() })} className="pl-7" autoCapitalize="none" spellCheck={false} />
              </div>
            )}
          </Field>
          <Field label="Display name" optional>
            {(p) => <Input {...p} value={draft.displayName} maxLength={PROFILE_LIMITS.name} onChange={(e) => set({ displayName: e.target.value })} />}
          </Field>
        </div>
        <Field label="Bio" optional hint={`${draft.bio.length}/${PROFILE_LIMITS.bio}`}>
          {(p) => <Textarea {...p} value={draft.bio} maxLength={PROFILE_LIMITS.bio} onChange={(e) => set({ bio: e.target.value })} className="min-h-20" placeholder="What you do, in a sentence or two." />}
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Links</span>
          <span className="-mt-1 text-[12px] text-ink-3">Website, GitHub, X. Shown as self-provided: adding an account here does not prove you own it.</span>
          {links.map((link, i) => (
            <Input
              key={i}
              value={link}
              inputMode="url"
              placeholder="https://"
              aria-label={`Link ${i + 1}`}
              onChange={(e) => {
                const next = [...links];
                next[i] = e.target.value;
                set({ links: next });
              }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[15px] font-semibold">How you use Pokter</legend>
        <UsageChoice value={draft.usage} onChange={(usage) => set({ usage })} />
        <p className="text-[12.5px] text-ink-3">Shapes your navigation and what your profile leads with. It grants nothing, and changing it never publishes anything.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[15px] font-semibold">What your public profile shows</legend>
        <Checkbox
          checked={draft.showBuilding}
          onChange={(e) => set({ showBuilding: e.target.checked })}
          label="Building"
          description="The agents you choose below, each with its own record and its eligible reviews."
        />
        {draft.showBuilding && (
          <div className="flex flex-col gap-2 pl-7">
            {agents.length === 0 ? (
              <p className="text-[13px] text-ink-3">This wallet owns no agents in the registry yet.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-medium">What you build</span>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((c) => {
                        const on = draft.tags.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => set({ tags: on ? draft.tags.filter((t) => t !== c.id) : [...draft.tags, c.id as Category] })}
                            className={cn('h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors', on ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink-3 hover:text-ink')}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                <span className="mt-2 text-[13px] font-medium">Agents to show · pin up to {PROFILE_LIMITS.pinned}</span>
                <ul className="flex flex-col divide-y divide-rule rounded-[12px] border border-rule">
                  {agents.map((a) => {
                    const shown = draft.agents.includes(a.key);
                    const pinned = draft.pinned.includes(a.key);
                    return (
                      <li key={a.key} className="flex items-center gap-3 px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Show ${a.name}`}
                          checked={shown}
                          onChange={(e) => set({ agents: e.target.checked ? [...draft.agents, a.key] : draft.agents.filter((k) => k !== a.key), pinned: e.target.checked ? draft.pinned : draft.pinned.filter((k) => k !== a.key) })}
                          className="size-4 accent-[var(--ink)]"
                        />
                        <AgentAvatar name={a.name} imageUrl={a.imageUrl} seed={a.key} size={32} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[14px] font-medium">{a.name}</span>
                          <span className="truncate text-[12px] text-ink-3">
                            #{a.tokenId} · {a.chainId === 56 ? 'BNB Chain' : 'Testnet'}
                            {a.category ? ` · ${a.category}` : ''}
                          </span>
                        </span>
                        <button
                          type="button"
                          aria-pressed={pinned}
                          disabled={!shown || (!pinned && draft.pinned.length >= PROFILE_LIMITS.pinned)}
                          onClick={() => set({ pinned: pinned ? draft.pinned.filter((k) => k !== a.key) : [...draft.pinned, a.key] })}
                          className={cn('inline-flex h-8 items-center gap-1 rounded-[8px] px-2.5 text-[12.5px] font-medium disabled:opacity-40', pinned ? 'bg-sunken text-ink' : 'text-ink-3 hover:text-ink')}
                        >
                          <Icon.Star size={13} aria-hidden /> {pinned ? 'Pinned' : 'Pin'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <span className="text-[12px] text-ink-3">Only agents this wallet owns in the registry now. Saved agents are never shown as yours.</span>
              </>
            )}
          </div>
        )}
        <Checkbox
          checked={draft.showWallet}
          onChange={(e) => set({ showWallet: e.target.checked })}
          label="Show my wallet address"
          description="Off: the profile leads with your handle and picture. Your agents still name this wallet in the public registry."
        />
        <Checkbox
          checked={draft.showHiring}
          onChange={(e) => set({ showHiring: e.target.checked })}
          label="Hiring"
          description="Your public requests, and counts of jobs you funded and how they ended. Never amounts, proposals or payment details."
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[15px] font-semibold">Publishing</legend>
        <Checkbox
          checked={draft.published}
          onChange={(e) => set({ published: e.target.checked, indexable: e.target.checked ? draft.indexable : false })}
          label="Publish my profile"
          description="Off: saved privately, and visitors see only what the registry says about this wallet. Needs a handle."
        />
        <Checkbox
          checked={draft.indexable}
          disabled={!draft.published}
          onChange={(e) => set({ indexable: e.target.checked })}
          label="Let search engines list it"
          description="Off still means public to anyone with the link."
        />
      </fieldset>

      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex flex-col-reverse gap-3 border-t border-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button intent="ghost" size="s" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={review} disabled={uploading} trailing={<Icon.Arrow size={15} />}>
          Review what is public
        </Button>
      </div>
    </section>
  );
}

/** Hire agents, Build agents, or Both. */
export function UsageChoice({ value, onChange }: { value: Usage | ''; onChange: (usage: Usage) => void }) {
  return (
    <div role="radiogroup" aria-label="How you use Pokter" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {USAGES.map((u) => {
        const on = value === u.id;
        return (
          <button
            key={u.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(u.id)}
            className={cn('flex flex-col items-start gap-0.5 rounded-[12px] border px-4 py-3 text-left transition-colors', on ? 'border-ink bg-raised shadow-[0_0_0_1px_var(--ink)]' : 'border-rule-strong hover:border-ink-3')}
          >
            <span className="text-[14.5px] font-semibold">{u.label}</span>
            <span className="text-[12.5px] text-ink-3">{u.id === 'hire' ? 'Post requests, hire and fund agents.' : u.id === 'build' ? 'List agents and get paid for jobs.' : 'Hire and build from one account.'}</span>
          </button>
        );
      })}
    </div>
  );
}

