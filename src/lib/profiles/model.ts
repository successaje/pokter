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

export const PROFILE_LIMITS = { handle: 20, name: 40, bio: 280, links: 3, url: 200, tags: 5, agents: 24, pinned: 3 } as const;
/** A signed edit is accepted for this long after it was made, so a captured one cannot be replayed later. */
export const PROFILE_EDIT_WINDOW_MS = 10 * 60_000;
/** An uploaded picture, by the SHA-256 of its bytes. */
export const AVATAR_ID = /^[0-9a-f]{64}$/;

/** What someone uses Pokter for. It shapes navigation and emphasis; it grants nothing. */
export const USAGES = [
  { id: 'hire', label: 'Hire agents', role: 'Hires agents' },
  { id: 'build', label: 'Build agents', role: 'Builds agents' },
  { id: 'both', label: 'Both', role: 'Builds and hires agents' },
] as const;
export type Usage = (typeof USAGES)[number]['id'];

const AGENT_KEY = /^(56|97):\d{1,12}$/;

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
  /** Empty until chosen in onboarding or Settings. */
  usage: Usage | '';
  /**
   * Whether the identity above is shown to visitors. Until it is, visitors
   * see only what the registry says about the wallet, and the owner's text
   * stays off the page.
   */
  published: boolean;
  /** Whether search engines are asked to index the page. Never makes a published page private. */
  indexable: boolean;
  /** Which parts of the account the published profile shows. Changing usage never turns these on. */
  showBuilding: boolean;
  showHiring: boolean;
  /** Agents chosen for the profile, as "chain:token"; each must be owned by this wallet when saved. */
  agents: string[];
  /** Up to three of those, shown first. */
  pinned: string[];
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
    `Usage: ${input.usage || 'unset'}`,
    `Published: ${input.published ? 'yes' : 'no'}`,
    `Search indexing: ${input.indexable ? 'yes' : 'no'}`,
    `Sections: ${[input.showBuilding && 'building', input.showHiring && 'hiring'].filter(Boolean).join(', ') || 'none'}`,
    `Agents: ${input.agents.join(', ')}`,
    `Pinned: ${input.pinned.join(', ')}`,
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
  if (raw.usage && !USAGES.some((u) => u.id === raw.usage)) return 'Choose how you use Pokter.';
  if (raw.agents.length > PROFILE_LIMITS.agents || raw.agents.some((a) => !AGENT_KEY.test(a))) return 'Those agents could not be read.';
  if (raw.pinned.length > PROFILE_LIMITS.pinned) return `Pin at most ${PROFILE_LIMITS.pinned} agents.`;
  if (raw.pinned.some((p) => !raw.agents.includes(p))) return 'Only agents shown on the profile can be pinned.';
  if (raw.published && !raw.handle) return 'Choose a handle before publishing.';
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
    usage: c.usage,
    published: Boolean(c.published),
    indexable: Boolean(c.published && c.indexable),
    showBuilding: Boolean(c.showBuilding),
    showHiring: Boolean(c.showHiring),
    agents: [...new Set(c.agents)],
    pinned: [...new Set(c.pinned)].filter((p) => c.agents.includes(p)),
  };
}

/** What arrived, normalised; null if it is the wrong shape or would be refused. */
export function readProfileContent(raw: unknown): ProfileContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const strings = ['handle', 'displayName', 'bio', 'avatar', 'usage'] as const;
  const arrays = ['links', 'tags', 'agents', 'pinned'] as const;
  if (strings.some((k) => typeof b[k] !== 'string') || arrays.some((k) => !Array.isArray(b[k]))) return null;
  const content = normalizeProfile({
    handle: b.handle as string,
    displayName: b.displayName as string,
    bio: b.bio as string,
    avatar: b.avatar as string,
    tags: (b.tags as unknown[]).map(String) as Category[],
    links: (b.links as unknown[]).map(String),
    usage: b.usage as Usage | '',
    published: b.published === true,
    indexable: b.indexable === true,
    showBuilding: b.showBuilding === true,
    showHiring: b.showHiring === true,
    agents: (b.agents as unknown[]).map(String),
    pinned: (b.pinned as unknown[]).map(String),
  });
  return profileProblem(content) ? null : content;
}

export function isEmptyProfile(c: ProfileContent): boolean {
  return !c.handle && !c.displayName && !c.bio && !c.avatar && c.tags.length === 0 && c.links.length === 0 && !c.usage && !c.published && c.agents.length === 0;
}

export const EMPTY_PROFILE: ProfileContent = {
  handle: '',
  displayName: '',
  bio: '',
  avatar: '',
  tags: [],
  links: [],
  usage: '',
  published: false,
  indexable: false,
  showBuilding: false,
  showHiring: false,
  agents: [],
  pinned: [],
};

/** The signed content alone, without the wallet, time and signature it was stored with. */
export function profileContentOf(p: Profile): ProfileContent {
  return {
    handle: p.handle,
    displayName: p.displayName,
    bio: p.bio,
    avatar: p.avatar,
    tags: p.tags,
    links: p.links,
    usage: p.usage,
    published: p.published,
    indexable: p.indexable,
    showBuilding: p.showBuilding,
    showHiring: p.showHiring,
    agents: p.agents,
    pinned: p.pinned,
  };
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

/** How long a signed request to read one's own unpublished draft stays good. */
export const DRAFT_READ_WINDOW_MS = 30 * 60_000;

/**
 * What the owner signs to read their own unpublished draft. A draft is
 * private until published, and the profile has no login of its own, so
 * reading it back takes this wallet's signature.
 */
export function draftReadMessage(wallet: string, signedAt: string): string {
  return ['Pokter profile draft', `Wallet: ${wallet.toLowerCase()}`, `At: ${signedAt}`, 'Read my unpublished profile. This grants nothing else.'].join('\n');
}
