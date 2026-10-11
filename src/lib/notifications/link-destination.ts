import type { EmailLinkTarget } from './server';

/**
 * Where an email link lands: a followed agent's own page, so it can show
 * that it is followed (or no longer is); Studio for builder alerts; the
 * inbox for job emails.
 */
export function emailLinkDestination(target: EmailLinkTarget | null): string {
  if (target?.kind === 'follow') return `/agents/${target.chainId}/${encodeURIComponent(target.tokenId)}`;
  if (target?.kind === 'builder') return '/studio';
  return '/workspace/inbox';
}
