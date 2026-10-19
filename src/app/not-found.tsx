import type { Metadata } from 'next';
import Link from 'next/link';

import { LinkButton } from '@/ui/Button';

export const metadata: Metadata = { title: 'Page not found' };

/**
 * No header, no footer, no `main`. The layout that this renders inside
 * already supplies all three, and rendering them here put two of each on
 * the page — two site headers, two `main#main`, two footers, one on top of
 * the other. It is easy to miss because both copies look right.
 */
export default function NotFound() {
  return (
    <div className="frame flex min-h-[60vh] flex-col items-start justify-center gap-6 py-24">
        <span className="t-readout text-sm text-ink-3">404</span>
        <h1 className="t-h1 max-w-xl">Nothing is registered at this address.</h1>
        <p className="t-body max-w-lg text-ink-2">
          The page may have moved in the redesign, or the agent you followed may no longer be listed. Agent pages live at
          <span className="t-readout mx-1 text-[13px]">/agents/chain/id</span>.
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/discover">Find an agent</LinkButton>
          <LinkButton href="/" intent="secondary">
            Home
          </LinkButton>
        </div>
        <Link href="/support" className="text-sm text-ink-3 hover:text-ink">
          Report a broken link
        </Link>
    </div>
  );
}
