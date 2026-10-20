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
  linkLabel,
  normalizeProfile,
  PROFILE_LIMITS,
  profileMessage,
  profilePath,
  profileProblem,
  type Profile,
  type ProfileContent,
} from '@/lib/profiles/model';
import { avatarUrl } from '@/lib/ui/avatar-art';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { AvatarImage } from '@/ui/AvatarImage';
import { Button } from '@/ui/Button';
import { CopyButton } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Field, Input, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';

const EMPTY: ProfileContent = { handle: '', displayName: '', bio: '', avatar: '', tags: [], links: [] };
const LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));

/**
 * The top of a profile: who this is, in their own words.
 *
 * It leads with a picture, a name and a handle rather than a wallet
 * address, and everything in it is the builder's own, labelled as
 * self-provided. The checks underneath say exactly what was checked —
 * control of this wallet, ownership of these agents — and nothing more.
 * The owner edits it in place.
 */
export function ProfileHeader({ wallet, profile, ownedVerified }: { wallet: string; profile: Profile | null; ownedVerified: number }) {
  const { address } = useActiveSigner();
  const own = Boolean(address && address.toLowerCase() === wallet.toLowerCase());
  const [editing, setEditing] = useState(false);

  if (editing && own) return <ProfileEditor wallet={wallet} profile={profile} onDone={() => setEditing(false)} />;

  const short = shortAddress(wallet);
  const picture = avatarSrc(profile?.avatar ?? '');
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <AvatarImage src={picture} fallback={avatarUrl(wallet.toLowerCase())} name={profile?.displayName || short} size={80} className="shrink-0 rounded-full" eager />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="t-h1 break-words text-[clamp(1.6rem,3.4vw,2.2rem)]">{profile?.displayName || (profile?.handle ? `@${profile.handle}` : <span className="t-readout">{short}</span>)}</h1>
            {profile?.handle && profile.displayName && <span className="text-[15px] text-ink-3">@{profile.handle}</span>}
            {profile && profile.tags.length > 0 && (
              <ul aria-label="Builds" className="mt-1.5 flex flex-wrap gap-1.5">
                {profile.tags.map((t) => (
                  <li key={t} className="rounded-full border border-rule-strong px-2.5 py-0.5 text-[12.5px] text-ink-2">
                    {LABEL.get(t)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ShareButton path={profilePath(wallet, profile?.handle)} title={profile?.displayName || profile?.handle || short} />
          <a href="#agents" className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-rule-strong px-3 text-[13.5px] font-medium text-ink-2 hover:border-ink-3 hover:text-ink">
            View agents
          </a>
          {own && (
            <Button size="s" onClick={() => setEditing(true)} icon={<Icon.Gear size={14} />}>
              {profile ? 'Edit profile' : 'Set up profile'}
            </Button>
          )}
        </div>
      </div>

      {profile?.bio && <p className="max-w-2xl whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-2">{profile.bio}</p>}
      {profile && profile.links.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {profile.links.map((link) => (
            <li key={link}>
              <a href={link} target="_blank" rel="nofollow ugc noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rule-strong px-3 py-1 text-[13px] text-ink-2 hover:border-ink-3 hover:text-ink">
                {linkLabel(link)} <Icon.External size={12} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
      {!profile && <p className="text-[14px] text-ink-3">{own ? 'Set up your profile: a picture, a handle, a few words about what you build.' : 'This builder has not set up a profile yet.'}</p>}

      {/* What was checked, said exactly. None of it is an endorsement. */}
      <ul aria-label="Checks" className="flex flex-col gap-1.5 border-t border-rule pt-4 text-[13px]">
        {profile && (
          <li className="flex flex-wrap items-center gap-x-2 text-ink-2">
            <span className="inline-flex items-center gap-1 font-medium text-ok">
              <Icon.Check size={13} aria-hidden /> Wallet control verified
            </span>
            <span className="text-ink-3">This wallet signed this profile. It proves who wrote it, not that it is true.</span>
          </li>
        )}
        {ownedVerified > 0 && (
          <li className="flex flex-wrap items-center gap-x-2 text-ink-2">
            <span className="inline-flex items-center gap-1 font-medium text-ok">
              <Icon.Shield size={13} aria-hidden /> Agent ownership verified
            </span>
            <span className="text-ink-3">
              for {ownedVerified} {ownedVerified === 1 ? 'agent' : 'agents'}: signed by the registry owner, and still owned by this wallet in the registry.
            </span>
          </li>
        )}
        <li className="flex flex-wrap items-center gap-x-2 text-ink-3">
          <span>Owner wallet</span>
          <span className="t-readout text-ink-2">{short}</span>
          <CopyButton value={wallet} label="Copy address" />
        </li>
        <li className="text-[12px] text-ink-3">Name, bio, tags and links are self-provided. Pokter does not endorse them or guarantee any agent&rsquo;s performance.</li>
      </ul>
    </header>
  );
}

function ShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} on Pokter`, url });
        return;
      }
    } catch {
      /* Cancelled or unavailable: fall back to copying. */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard blocked; nothing else to do. */
    }
  };
  return (
    <button type="button" onClick={() => void share()} className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-rule-strong px-3 text-[13.5px] font-medium text-ink-2 hover:border-ink-3 hover:text-ink">
      <Icon.Share size={14} aria-hidden /> {copied ? 'Link copied' : 'Share profile'}
    </button>
  );
}

function ProfileEditor({ wallet, profile, onDone }: { wallet: string; profile: Profile | null; onDone: () => void }) {
  const router = useRouter();
  const { sign, canSign } = useActiveSigner();
  const { chain } = useAccount();
  const [draft, setDraft] = useState<ProfileContent>(
    profile ? { handle: profile.handle, displayName: profile.displayName, bio: profile.bio, avatar: profile.avatar, tags: profile.tags, links: profile.links } : EMPTY,
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const links = [...draft.links, '', '', ''].slice(0, PROFILE_LIMITS.links);
  const handleIssue = handleProblem(draft.handle.trim().toLowerCase());

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    setUploading(true);
    setError(null);
    try {
      const r = await fetch('/api/profiles/avatar', { method: 'POST', body: picked });
      const body = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok || !body.id) throw new Error(body.error ?? 'The picture was not uploaded.');
      setDraft((d) => ({ ...d, avatar: body.id! }));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = '';
    }
  };

  const save = async (content: ProfileContent) => {
    const clean = normalizeProfile(content);
    const problem = profileProblem(clean);
    if (problem) {
      setError(problem);
      return;
    }
    if (!canSign) {
      setError('Connect this wallet to sign the change.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
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
      onDone();
      /* A new handle is a new address for the page. */
      router.replace(profilePath(wallet, clean.handle));
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'The profile was not saved.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing changed.' : message);
    } finally {
      setBusy(false);
    }
  };

  const picture = avatarSrc(draft.avatar);
  return (
    <section aria-labelledby="edit-title" className="flex flex-col gap-5 rounded-[18px] border border-ink bg-raised p-6">
      <div className="flex flex-col gap-1">
        <h2 id="edit-title" className="text-[19px] font-semibold">
          Your profile
        </h2>
        <p className="text-[13px] text-ink-3">Shown as self-provided. It never changes what Pokter shows about your agents or your work.</p>
      </div>

      <div className="flex items-center gap-4">
        <AvatarImage src={picture} fallback={avatarUrl(wallet.toLowerCase())} name="Your picture" size={72} className="rounded-full" />
        <div className="flex flex-col gap-2">
          <span className="flex flex-wrap gap-2">
            <Button size="s" intent="secondary" onClick={() => file.current?.click()} busy={uploading}>
              Upload picture
            </Button>
            {draft.avatar && (
              <Button size="s" intent="ghost" onClick={() => setDraft({ ...draft, avatar: '' })}>
                Use generated
              </Button>
            )}
          </span>
          <span className="text-[12px] text-ink-3">PNG, JPEG or WebP, up to 512 KB. Without one, the generated picture is used.</span>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Handle" hint={`pokter.xyz/builders/${draft.handle.trim().toLowerCase() || 'your-handle'}`} error={draft.handle && handleIssue ? handleIssue : undefined}>
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-ink-3">@</span>
              <Input {...p} value={draft.handle} maxLength={PROFILE_LIMITS.handle} onChange={(e) => setDraft({ ...draft, handle: e.target.value.toLowerCase() })} className="pl-7" autoCapitalize="none" spellCheck={false} />
            </div>
          )}
        </Field>
        <Field label="Display name" optional>
          {(p) => <Input {...p} value={draft.displayName} maxLength={PROFILE_LIMITS.name} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />}
        </Field>
      </div>

      <Field label="Bio" optional hint={`${draft.bio.length}/${PROFILE_LIMITS.bio}`}>
        {(p) => <Textarea {...p} value={draft.bio} maxLength={PROFILE_LIMITS.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} className="min-h-24" placeholder="What you build, and for whom." />}
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">What you build</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = draft.tags.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setDraft({ ...draft, tags: on ? draft.tags.filter((t) => t !== c.id) : [...draft.tags, c.id as Category] })}
                className={cn('h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors', on ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink-3 hover:text-ink')}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Links</legend>
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
              setDraft({ ...draft, links: next });
            }}
          />
        ))}
      </fieldset>

      <Notice tone="watch" title="Your agents’ owner is public anyway">
        The ERC-8004 registry shows which wallet owns each agent, so anyone can connect your agents to this wallet whatever this page shows. A handle and picture make the profile readable; they do not make ownership private.
      </Notice>

      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex flex-col-reverse gap-3 border-t border-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex gap-2">
          <Button intent="ghost" size="s" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
          {profile && (
            <Button intent="ghost" size="s" onClick={() => void save(EMPTY)} disabled={busy}>
              Clear profile
            </Button>
          )}
        </span>
        <span className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button onClick={() => void save(draft)} busy={busy} disabled={uploading}>
            {busy ? 'Approve in your wallet' : 'Sign and save'}
          </Button>
          <span className="text-[12px] text-ink-3">A signature, not a transaction. No fee.</span>
        </span>
      </div>
    </section>
  );
}
