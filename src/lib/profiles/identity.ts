import 'server-only';

import { avatarSrc, profilePath } from './model';
import { getProfileStore } from './store';

export interface PublicIdentity {
  name: string;
  /** The uploaded picture, or null for the generated one. */
  avatar: string | null;
  href: string;
}

/**
 * How a wallet appears beside its activity elsewhere on the site: its
 * name and picture, once its profile is published. Null until then, so a
 * private profile never shows up through a request or a proposal.
 */
export function publicIdentity(wallet: string): PublicIdentity | null {
  const profile = getProfileStore().get(wallet);
  if (!profile?.published) return null;
  return {
    name: profile.displayName || (profile.handle ? `@${profile.handle}` : `${wallet.slice(0, 6)}…${wallet.slice(-4)}`),
    avatar: avatarSrc(profile.avatar),
    href: profilePath(wallet, profile.handle),
  };
}

/** The same, for many wallets at once, read once each. */
export function publicIdentities(wallets: string[]): Map<string, PublicIdentity> {
  const out = new Map<string, PublicIdentity>();
  for (const wallet of new Set(wallets.map((w) => w.toLowerCase()))) {
    const identity = publicIdentity(wallet);
    if (identity) out.set(wallet, identity);
  }
  return out;
}
