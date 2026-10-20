'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAccount } from 'wagmi';

import { isEscrowChain } from '@/lib/network/escrow';
import { CHAIN_ID } from '@/lib/network/presentation';
import { linkLabel, normalizeProfile, PROFILE_LIMITS, profileMessage, profileProblem, type Profile, type ProfileContent } from '@/lib/profiles/model';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Field, Input, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';

const EMPTY: ProfileContent = { displayName: '', bio: '', avatarUrl: '', links: [] };

/**
 * "About": what this wallet says about itself.
 *
 * Labelled as self-provided wherever it appears, because a wallet signing
 * its own bio proves who wrote it and nothing more. The owner edits it in
 * place; everyone else reads it. It never feeds the evidence below it.
 */
export function ProfileAbout({ wallet, profile }: { wallet: string; profile: Profile | null }) {
  const { address } = useActiveSigner();
  const own = Boolean(address && address.toLowerCase() === wallet.toLowerCase());
  const [editing, setEditing] = useState(false);

  if (editing && own) return <ProfileEditor wallet={wallet} profile={profile} onDone={() => setEditing(false)} />;

  const hasText = Boolean(profile && (profile.bio || profile.links.length > 0));
  return (
    <section aria-labelledby="about-title" className="flex flex-col gap-3 rounded-[16px] border border-rule bg-raised p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="about-title" className="text-[17px] font-semibold">
          About
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
          <Icon.User size={13} aria-hidden /> Self-provided · not verified by Pokter
        </span>
      </div>
      {hasText ? (
        <>
          {profile!.bio && <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-ink-2">{profile!.bio}</p>}
          {profile!.links.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {profile!.links.map((link) => (
                <li key={link}>
                  <a
                    href={link}
                    target="_blank"
                    rel="nofollow ugc noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-rule-strong px-3 py-1 text-[13px] text-ink-2 hover:border-ink-3 hover:text-ink"
                  >
                    {linkLabel(link)} <Icon.External size={12} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-ink-3">Signed by this wallet on {new Date(profile!.signedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. The signature shows who wrote it, not that it is true.</p>
        </>
      ) : (
        <p className="text-[14px] text-ink-3">{own ? 'Add a name, a picture, a few words and some links, so people know who is behind this wallet.' : 'This wallet has not written anything about itself.'}</p>
      )}
      {own && (
        <div>
          <Button size="s" intent="secondary" onClick={() => setEditing(true)} icon={<Icon.Gear size={14} />}>
            {profile ? 'Edit profile' : 'Set up profile'}
          </Button>
        </div>
      )}
    </section>
  );
}

function ProfileEditor({ wallet, profile, onDone }: { wallet: string; profile: Profile | null; onDone: () => void }) {
  const router = useRouter();
  const { sign, canSign } = useActiveSigner();
  const { chain } = useAccount();
  const [draft, setDraft] = useState<ProfileContent>(profile ? { displayName: profile.displayName, bio: profile.bio, avatarUrl: profile.avatarUrl, links: profile.links } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const links = [...draft.links, '', '', ''].slice(0, PROFILE_LIMITS.links);

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
      router.refresh();
      onDone();
    } catch (caught) {
      const message = (caught as Error).message || 'The profile was not saved.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing changed.' : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="edit-title" className="flex flex-col gap-4 rounded-[16px] border border-ink bg-raised p-5">
      <div className="flex flex-col gap-1">
        <h2 id="edit-title" className="text-[17px] font-semibold">
          Your profile
        </h2>
        <p className="text-[13px] text-ink-3">Shown as self-provided. It never changes what Pokter shows about your agents or your activity.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Display name" optional hint={`Up to ${PROFILE_LIMITS.name} characters. Your address is always shown beside it.`}>
          {(p) => <Input {...p} value={draft.displayName} maxLength={PROFILE_LIMITS.name} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />}
        </Field>
        <Field label="Picture" optional hint="An https image address. Left empty, a generated picture is used.">
          {(p) => <Input {...p} value={draft.avatarUrl} inputMode="url" placeholder="https://" onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value })} />}
        </Field>
      </div>
      <Field label="Bio" optional hint={`${draft.bio.length}/${PROFILE_LIMITS.bio}`}>
        {(p) => <Textarea {...p} value={draft.bio} maxLength={PROFILE_LIMITS.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} className="min-h-24" />}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Links</legend>
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
          <Button onClick={() => void save(draft)} busy={busy}>
            {busy ? 'Approve in your wallet' : 'Sign and save'}
          </Button>
          <span className="text-[12px] text-ink-3">A signature, not a transaction. No fee.</span>
        </span>
      </div>
    </section>
  );
}
