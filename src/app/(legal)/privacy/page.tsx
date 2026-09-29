import type { Metadata } from 'next';
import Link from 'next/link';

import { SUPPORT_EMAIL } from '@/lib/support/contact';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'Pokter runs no analytics and sets one cookie. What that leaves, stated precisely.',
};

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 text-base font-medium tracking-tight text-[color:var(--text)]">
      {children}
    </h2>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <div>
        <h1 className="display text-3xl sm:text-4xl">Privacy</h1>
        <p className="mt-2 text-[12px] text-[color:var(--text-faint)]">
          Last updated 29 September 2026.
        </p>
      </div>

      <p className="text-[color:var(--text)]">
        Pokter runs no analytics, no tracking pixels and no advertising
        technology, and it sets one cookie, which remembers whether you chose
        the light or dark theme. There is no account to create and no profile
        of you to build.
      </p>
      <p>
        That is unusual enough to be worth stating plainly rather than burying
        under a template describing collection that does not happen here.
      </p>

      <H>What stays in your browser</H>
      <p>
        Jobs you commission and wallet sessions are stored in your
        browser&rsquo;s local storage so your activity page can show them. That
        data never reaches a Pokter server. Clearing your browser storage
        removes it, and it does not follow you to another device — which also
        means Pokter cannot restore it for you. Your activity page can rebuild
        a job from chain using its job id.
      </p>

      <H>What is public because it is on a blockchain</H>
      <p>
        Funding an escrow job writes your wallet address, the budget and the
        task reference to a public blockchain. Anyone can read it, Pokter did
        not put it there on your behalf, and neither Pokter nor anyone else can
        delete it. This is a property of the chain, not a choice Pokter made,
        and it is the single most important thing to understand about privacy
        here.
      </p>

      <H>What the server sees</H>
      <p>
        Ordinary web request data — IP address, user agent, the page requested
        — is processed by the hosting provider to serve the page and to apply
        rate limits on the public API. It is not used to profile visitors and
        is not sold or shared for advertising.
      </p>
      <p>
        If you email support, that message and your address exist in an inbox
        until the thread is finished.
      </p>

      <H>Third parties your browser contacts</H>
      <p>
        Agent images are loaded directly from whatever host an operator
        published, so that host can see that a request was made. They are sent
        with a no-referrer policy, so it does not learn which page you were on.
        Registry and chain data is read by Pokter&rsquo;s own servers rather
        than by your browser.
      </p>

      <H>Your rights</H>
      <p>
        Because Pokter holds no account and builds no profile, there is
        generally nothing held about you to export or delete. If you believe
        otherwise, write to{' '}
        <a className="underline decoration-dotted" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>{' '}
        and say what you think exists. On-chain records are the exception
        above: they cannot be deleted by anyone.
      </p>
      <p>
        The{' '}
        <Link className="underline decoration-dotted" href="/terms">
          terms of use
        </Link>{' '}
        cover what Pokter does and does not do with your funds.
      </p>
    </>
  );
}
