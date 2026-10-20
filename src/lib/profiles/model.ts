import { CATEGORIES, type Category } from '@/lib/agents/categories';

/**
 * What a wallet says about itself.
 *
 * Everything here is self-provided: a handle, a name, a picture, a few
 * sentences, the kinds of agent it builds, some links. The wallet's
 * signature proves who authorised the text, not that it is true, so none
 * of it is ever shown as verified, used to rank anything, or mixed with
 * what Pokter measured. Evidence lives elsewhere on the profile and
 * cannot be edited.
 */

export const PROFILE_LIMITS = { handle: 20, name: 40, bio: 280, links: 3, url: 200, tags: 5 } as const;
/** A signed edit is accepted for this long after it was made, so a captured one cannot be replayed later. */
export const PROFILE_EDIT_WINDOW_MS = 10 * 60_000;
/** An uploaded picture, by the SHA-256 of its bytes. */
export const AVATAR_ID = /^[0-9a-f]{64}$/;

export interface ProfileContent {
  /** Unique, lowercase; the profile's address is /builders/<handle>. Empty until chosen. */
  handle: string;
  displayName: string;
  bio: string;
  /** An uploaded picture's id, or empty for the generated one. */
  avatar: string;
  /** Agent categories this builder works in, by id. */
  tags: Category[];
  links: string[];
}

export interface Profile extends ProfileContent {
  wallet: string;
  signedAt: string;
  signature: string;
}

/*
 * Handles that would read as a part of the site, or as Pokter speaking.
 * Self-provided text sits on Pokter's own pages, so these are the claims
 * it cannot be allowed to make.
 */
const RESERVED_HANDLES = new Set(['admin', 'api', 'build', 'builders', 'discover', 'help', 'hiring', 'official', 'proof', 'requests', 'root', 'staff', 'support', 'team', 'workspace']);
const SPEAKS_FOR_POKTER = /pokter/i;
const HANDLE = /^[a-z][a-z0-9-]{1,18}[a-z0-9]$/;

/** The exact text a wallet signs to set its profile; any field changed afterwards stops verifying. */
export function profileMessage(input: ProfileContent & { wallet: string; signedAt: string }): string {
  return [
    'Pokter profile',
    `Wallet: ${input.wallet.toLowerCase()}`,
    `At: ${input.signedAt}`,
    `Handle: ${input.handle}`,
    `Name: ${input.displayName}`,
    `Bio: ${input.bio}`,
    `Avatar: ${input.avatar || 'generated'}`,
    `Tags: ${input.tags.join(', ')}`,
    `Links: ${input.links.join(' | ')}`,
    'This is self-provided information. Signing proves this wallet authorised it, not that it is true.',
  ].join('\n');
}

function httpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:' && value.length <= PROFILE_LIMITS.url;
  } catch {
    return false;
  }
}

/** Why a handle would be refused, or null. */
export function handleProblem(handle: string): string | null {
  if (!handle) return null;
  if (!HANDLE.test(handle)) return 'A handle is 3 to 20 lowercase letters, numbers or hyphens, starting with a letter.';
  if (RESERVED_HANDLES.has(handle) || SPEAKS_FOR_POKTER.test(handle)) return 'That handle is reserved.';
  return null;
}

/** Why the content would be refused, or null. Shared by the form and the server so they never disagree. */
export function profileProblem(raw: ProfileContent): string | null {
  const handle = handleProblem(raw.handle);
  if (handle) return handle;
  if (raw.displayName.length > PROFILE_LIMITS.name) return `Keep the name under ${PROFILE_LIMITS.name} characters.`;
  if (SPEAKS_FOR_POKTER.test(raw.displayName)) return 'A name cannot include “Pokter”, so it is never read as Pokter speaking.';
  if (raw.bio.length > PROFILE_LIMITS.bio) return `Keep the bio under ${PROFILE_LIMITS.bio} characters.`;
  if (raw.avatar && !AVATAR_ID.test(raw.avatar)) return 'That picture could not be found. Upload it again.';
  if (raw.tags.length > PROFILE_LIMITS.tags) return `At most ${PROFILE_LIMITS.tags} tags.`;
  if (raw.tags.some((t) => !CATEGORIES.some((c) => c.id === t))) return 'Tags come from the agent categories.';
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
    handle: c.handle.trim().toLowerCase(),
    displayName: c.displayName.trim().replace(/\s+/g, ' '),
    bio: c.bio.trim(),
    avatar: c.avatar.trim(),
    tags: CATEGORIES.map((cat) => cat.id).filter((id) => c.tags.includes(id)),
    links: c.links.map((l) => l.trim()).filter(Boolean),
  };
}

/** What arrived, normalised; null if it is the wrong shape or would be refused. */
export function readProfileContent(raw: unknown): ProfileContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const strings = ['handle', 'displayName', 'bio', 'avatar'] as const;
  if (strings.some((k) => typeof b[k] !== 'string') || !Array.isArray(b.links) || !Array.isArray(b.tags)) return null;
  const content = normalizeProfile({
    handle: b.handle as string,
    displayName: b.displayName as string,
    bio: b.bio as string,
    avatar: b.avatar as string,
    tags: (b.tags as unknown[]).map(String) as Category[],
    links: (b.links as unknown[]).map(String),
  });
  return profileProblem(content) ? null : content;
}

export function isEmptyProfile(c: ProfileContent): boolean {
  return !c.handle && !c.displayName && !c.bio && !c.avatar && c.tags.length === 0 && c.links.length === 0;
}

/** A link as shown: its host, never the full URL, so a link cannot carry a misleading label. */
export function linkLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Where an uploaded picture is served from. */
export function avatarSrc(avatar: string): string | null {
  return AVATAR_ID.test(avatar) ? `/api/profiles/avatar/${avatar}` : null;
}

/** The path a profile lives at: its handle once it has one, its address until then. */
export function profilePath(wallet: string, handle?: string | null): string {
  return `/builders/${handle || wallet}`;
}
