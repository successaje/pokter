/**
 * What a wallet says about itself.
 *
 * Everything here is self-provided: a name, a picture, a few sentences and
 * some links. The wallet's signature proves who authorised the text, not
 * that it is true, so none of it is ever shown as verified, used to rank
 * anything, or mixed with what Pokter measured. Evidence lives elsewhere
 * on the profile and cannot be edited.
 */

export const PROFILE_LIMITS = { name: 40, bio: 280, links: 3, url: 200 } as const;
/** A signed edit is accepted for this long after it was made, so a captured one cannot be replayed later. */
export const PROFILE_EDIT_WINDOW_MS = 10 * 60_000;

export interface ProfileContent {
  displayName: string;
  bio: string;
  /** An https image URL, or empty for the generated avatar. */
  avatarUrl: string;
  links: string[];
}

export interface Profile extends ProfileContent {
  wallet: string;
  signedAt: string;
  signature: string;
}

/*
 * A name that reads as Pokter speaking. Self-provided text sits on
 * Pokter's own pages, so this is the one claim it cannot be allowed to make.
 */
const RESERVED = /pokter/i;

/** The exact text a wallet signs to set its profile; any field changed afterwards stops verifying. */
export function profileMessage(input: ProfileContent & { wallet: string; signedAt: string }): string {
  return [
    'Pokter profile',
    `Wallet: ${input.wallet.toLowerCase()}`,
    `At: ${input.signedAt}`,
    `Name: ${input.displayName}`,
    `Bio: ${input.bio}`,
    `Avatar: ${input.avatarUrl}`,
    `Links: ${input.links.join(' | ')}`,
    'This is self-provided information. Signing proves this wallet authorised it, not that it is true.',
  ].join('\n');
}

function httpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && value.length <= PROFILE_LIMITS.url ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Why the content would be refused, or null. Shared by the form and the server so they never disagree. */
export function profileProblem(raw: ProfileContent): string | null {
  if (raw.displayName.length > PROFILE_LIMITS.name) return `Keep the name under ${PROFILE_LIMITS.name} characters.`;
  if (RESERVED.test(raw.displayName)) return 'A name cannot include “Pokter”, so it is never read as Pokter speaking.';
  if (raw.bio.length > PROFILE_LIMITS.bio) return `Keep the bio under ${PROFILE_LIMITS.bio} characters.`;
  if (raw.avatarUrl && !httpsUrl(raw.avatarUrl)) return 'The picture must be an https address.';
  if (raw.links.length > PROFILE_LIMITS.links) return `At most ${PROFILE_LIMITS.links} links.`;
  if (raw.links.some((l) => !httpsUrl(l))) return 'Each link must be an https address.';
  return null;
}

/**
 * The content as it is signed and stored. The form signs the result of
 * this, and the server checks the signature against the result of this,
 * so whitespace a person typed can never make a valid edit fail to verify.
 */
export function normalizeProfile(c: ProfileContent): ProfileContent {
  return {
    displayName: c.displayName.trim().replace(/\s+/g, ' '),
    bio: c.bio.trim(),
    avatarUrl: c.avatarUrl.trim(),
    links: c.links.map((l) => l.trim()).filter(Boolean),
  };
}

/** What arrived, normalised; null if it is the wrong shape or would be refused. */
export function readProfileContent(raw: unknown): ProfileContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.displayName !== 'string' || typeof b.bio !== 'string' || typeof b.avatarUrl !== 'string' || !Array.isArray(b.links)) return null;
  const content = normalizeProfile({ displayName: b.displayName, bio: b.bio, avatarUrl: b.avatarUrl, links: b.links.map((l) => String(l)) });
  return profileProblem(content) ? null : content;
}

export function isEmptyProfile(c: ProfileContent): boolean {
  return !c.displayName && !c.bio && !c.avatarUrl && c.links.length === 0;
}

/** A link as shown: its host, never the full URL, so a link cannot carry a misleading label. */
export function linkLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
