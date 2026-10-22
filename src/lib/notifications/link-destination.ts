import type { EmailLinkTarget } from './server';

/**
 * Where an email link lands: a followed agent's own page, so it can show
 * that it is followed (or no longer is); Studio for builder alerts; the
 * inbox for job emails.
 */
export function emailLinkDestination(target: EmailLinkTarget | null): string {
  if (target?.kind === 'follow') return `/agents/${target.chainId}/${encodeURIComponent(target.tokenId)}`;
  if (target?.kind === 'builder') return '/build';
  if (target?.kind === 'campaign') return '/set-and-earn';
  if (target?.kind === 'loan-watch') return '/watch';
  if (target?.kind === 'trading') return '/trading';
  return '/workspace/inbox';
}
