import Link from 'next/link';

import { SiteFooter } from '@/shell/SiteFooter';
import { SiteHeader } from '@/shell/SiteHeader';
import { LinkButton } from '@/ui/Button';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="frame flex min-h-[60vh] flex-col items-start justify-center gap-6 py-24">
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
      </main>
      <SiteFooter />
    </>
  );
}
