'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAccount } from 'wagmi';

import { isEscrowChain } from '@/lib/network/escrow';
import { CHAIN_ID } from '@/lib/network/presentation';
import { draftReadMessage, EMPTY_PROFILE, type ProfileContent, type Usage } from '@/lib/profiles/model';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { ProfileEditor, UsageChoice, useSaveProfile, type OwnedAgentOption } from './ProfileEditor';
import { rememberedUsage, rememberUsage } from './usage';

/**
 * The profile page around its content: the owner's controls, and the
 * editor in place of the content while editing.
 *
 * Visitors get the page as rendered. The owner — the connected wallet is
 * this profile's wallet — also gets Edit profile, Preview public profile
 * and, on a first visit, the one question onboarding asks. Previewing
 * hides every owner control, so what they see is what a visitor sees.
 */
export function ProfileShell({
  wallet,
  published,
  hasSaved,
  agents,
  hiringActivity,
  identity,
  children,
}: {
  wallet: string;
  /** The published content, or null when nothing is published. Never a private draft. */
  published: ProfileContent | null;
  /** Whether a profile is stored at all, published or not. */
  hasSaved: boolean;
  agents: OwnedAgentOption[];
  hiringActivity: { requests: number; jobsFunded: number };
  identity: ReactNode;
  children: ReactNode;
}) {
  const { address, sign, canSign } = useActiveSigner();
  const { chain } = useAccount();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const own = Boolean(address && address.toLowerCase() === wallet.toLowerCase());
  const previewing = params.get('preview') === '1';
  const [editing, setEditing] = useState<ProfileContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveProfile(wallet);

  const exitPreview = () => {
    const next = new URLSearchParams(params);
    next.delete('preview');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`);
  };
  const previewHref = (() => {
    const next = new URLSearchParams(params);
    next.set('preview', '1');
    return `${pathname}?${next}`;
  })();

  /* A private draft is read back only with this wallet's signature. */
  const openEditor = async () => {
    setError(null);
    if (published) {
      setEditing(published);
      return;
    }
    if (!hasSaved) {
      setEditing({ ...EMPTY_PROFILE, usage: rememberedUsage(wallet) });
      return;
    }
    if (!canSign) {
      setError('Connect this wallet to open your private profile.');
      return;
    }
    setBusy(true);
    try {
      const signedAt = new Date().toISOString();
      const chainId = chain && isEscrowChain(chain.id) ? chain.id : CHAIN_ID;
      const signature = await sign(draftReadMessage(wallet, signedAt));
      const r = await fetch('/api/profiles/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet, signedAt, signature, chainId }) });
      const body = (await r.json().catch(() => ({}))) as { content?: ProfileContent | null; error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Your profile could not be opened.');
      setEditing(body.content ?? EMPTY_PROFILE);
    } catch (caught) {
      const message = (caught as Error).message || 'Your profile could not be opened.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Your profile stays as it is.' : message);
    } finally {
      setBusy(false);
    }
  };

  /* First visit, nothing saved: one question, then the profile is the person's own. */
  const chooseUsage = async (usage: Usage) => {
    setBusy(true);
    setError(null);
    try {
      await save({ ...EMPTY_PROFILE, usage });
      rememberUsage(wallet, usage);
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'That was not saved.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was saved.' : message);
    } finally {
      setBusy(false);
    }
  };

  const ownerTools = own && !previewing;
  const needsOnboarding = ownerTools && !hasSaved && !editing;

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-12">
      <aside className="flex flex-col gap-5 lg:sticky lg:top-24">
        {identity}
        {ownerTools && !editing && (
          <div className="flex flex-col gap-2 border-t border-rule pt-4">
            <Button onClick={() => void openEditor()} busy={busy} icon={<Icon.Gear size={14} />} className="justify-center">
              {hasSaved ? 'Edit profile' : 'Set up profile'}
            </Button>
            <Link href={previewHref} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-rule-strong px-3 text-[13.5px] font-medium text-ink-2 hover:border-ink-3 hover:text-ink">
              <Icon.Eye size={14} aria-hidden /> Preview public profile
            </Link>
            {!published && <p className="text-[12px] text-ink-3">{hasSaved ? 'Not published: visitors see only what the registry says about this wallet.' : 'No profile yet.'}</p>}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        {own && previewing && (
          <Notice
            title="Previewing as a visitor"
            action={
              <Button size="s" intent="secondary" onClick={exitPreview}>
                Exit preview
              </Button>
            }
          >
            This is what anyone with the link sees. Your edit controls are hidden.
          </Notice>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        {needsOnboarding && (
          <section aria-labelledby="onboard-title" className="flex flex-col gap-4 rounded-[18px] border border-ink bg-raised p-6">
            <div className="flex flex-col gap-1">
              <h2 id="onboard-title" className="text-[19px] font-semibold">
                What brings you to Pokter?
              </h2>
              <p className="text-[13.5px] text-ink-2">It shapes your navigation and what your profile leads with. You can change it any time in Settings, and it grants nothing on its own.</p>
            </div>
            <UsageChoice value={rememberedUsage(wallet)} onChange={(u) => void chooseUsage(u)} />
            <p className="text-[12px] text-ink-3">{busy ? 'Approve in your wallet…' : 'Saved with a signature, privately. Nothing is published.'}</p>
          </section>
        )}
        {editing ? <ProfileEditor wallet={wallet} initial={editing} agents={agents} hiringActivity={hiringActivity} onDone={() => setEditing(null)} /> : children}
      </div>
    </div>
  );
}
