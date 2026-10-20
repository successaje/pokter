import { ImageResponse } from 'next/og';
import { getAddress, isAddress } from 'viem';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { INK, INK2, INK3, Mark, PAPER, RULE, contentType, size } from '@/lib/og/card';
import { getProfileStore } from '@/lib/profiles/store';
import { listAgents } from '@/lib/scan/client';

export const alt = 'A profile on Pokter';
export { contentType, size };

/**
 * The shared-link card for a profile: the builder's own name and handle,
 * the kinds of agent they build, and one counted fact — how many agents
 * the registry says they own. Self-provided text is drawn as theirs, and
 * the only number is one anyone can check.
 */
export default async function ProfileImage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  const store = getProfileStore();
  /* Published content only: a private draft never reaches a share card. */
  const stored = isAddress(raw) ? store.get(raw) : store.byHandle(decodeURIComponent(raw));
  const profile = stored?.published ? stored : null;
  const wallet = profile ? getAddress(profile.wallet) : isAddress(raw) ? getAddress(raw) : null;
  const short = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'Builder';
  /* A count the index could not give is left out, never drawn as zero. */
  const pages = wallet ? await Promise.all([56, 97].map((chainId) => listAgents({ chainId: chainId as 56 | 97, ownerAddress: wallet, limit: 100 }).catch(() => null))) : [];
  const owned = pages.length > 0 && pages.every((p) => p !== null) ? pages.reduce((n, p) => n + p!.items.length, 0) : null;
  const name = profile?.displayName || (profile?.handle ? `@${profile.handle}` : short);
  const tags = (profile?.showBuilding ? profile.tags : []).map((t) => CATEGORY_BY_ID.get(t)?.label).filter(Boolean).slice(0, 4);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: PAPER, color: INK, padding: '64px 72px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, fontWeight: 600 }}>
          <Mark size={36} ink={INK} />
          Pokter
          <span style={{ color: INK3, fontWeight: 400, fontSize: 24, marginLeft: 8 }}>· Profile</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 14 }}>
          <div style={{ display: 'flex', fontSize: name.length > 24 ? 64 : 84, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>{name}</div>
          {profile?.handle && profile.displayName && <div style={{ display: 'flex', fontSize: 32, color: INK3 }}>@{profile.handle}</div>}
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              {tags.map((t) => (
                <div key={t} style={{ display: 'flex', border: `2px solid ${RULE}`, borderRadius: 999, padding: '6px 18px', fontSize: 24, color: INK2 }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 40, paddingTop: 24, borderTop: `2px solid ${RULE}`, fontSize: 26, color: INK2 }}>
          <span style={{ display: 'flex' }}>{owned === null ? 'On Pokter' : `${owned} ${owned === 1 ? 'agent' : 'agents'} in the ERC-8004 registry`}</span>
          <span style={{ display: 'flex', color: INK3, fontSize: 22 }}>pokter.xyz</span>
        </div>
      </div>
    ),
    size,
  );
}
