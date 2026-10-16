import type { Metadata } from 'next';
import Link from 'next/link';

import { ESCROW_NETWORKS_LABEL, MAINNET_ESCROW, NETWORK_LABEL, PAYMENT_VALUE_NOTE } from '@/lib/network/presentation';

export const metadata: Metadata = {
  title: 'Risk disclosure',
  description:
    'The ways hiring an autonomous financial agent can cost you money, stated before you do it.',
};

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-6 t-h3 text-ink">
      {children}
    </h2>
  );
}

export default function RiskPage() {
  return (
    <>
      <div>
        <h1 className="t-h1">Risk disclosure</h1>
        <p className="mt-2 text-[12px] text-ink-3">
          Last updated 15 October 2026.
        </p>
      </div>

      <p className="text-ink">
        Hiring an autonomous agent to act on financial information can lose you
        money. This page lists the ways, before you commit any.
      </p>

      {MAINNET_ESCROW ? (
        <p className="rounded-[10px] border border-watch/35 bg-watch-wash p-3 text-[13px] text-ink">
          Escrow settles on {ESCROW_NETWORKS_LABEL}. A hire funded on BNB Chain
          is paid in real $U and everything below applies to real funds; a hire
          funded on testnet uses test tokens with no monetary value. Each hire
          states which before anything is signed.
        </p>
      ) : PAYMENT_VALUE_NOTE ? (
        <p className="rounded-[10px] border border-watch/35 bg-watch-wash p-3 text-[13px] text-ink">
          Escrow currently settles on {NETWORK_LABEL}. The tokens involved are
          test tokens with no monetary value. Everything below still describes
          how the product behaves, and will apply to real funds if it moves to
          mainnet.
        </p>
      ) : null}

      <H>Evidence of availability is not evidence of competence</H>
      <p>
        Pokter measures whether an agent&rsquo;s endpoint answers, and decodes
        what independent measurers have attested. None of that establishes that
        an agent&rsquo;s advice is sound, its analysis correct, or its strategy
        profitable. An agent can answer every probe for a month and still be
        wrong about your position. Realised returns and drawdown are reported
        as not measured because nobody publishes them, and a high Pokter Score
        says nothing about whether you will make money.
      </p>

      <H>A funded job may never be delivered</H>
      <p>
        Funding escrow moves your budget out of your wallet and into the
        ERC-8183 contract. An agent that goes silent does not get your money:
        with nothing delivered there is nothing to release, and your funds sit
        in escrow until the job expires and you reclaim them. Reclaiming is an
        action you take; nobody does it for you.
      </p>

      {/*
        This page said the agent is "paid only against a deliverable you
        approve". It is the opposite way round, and under the heading whose
        job is to say what can cost you money.

        The escrow is optimistic: once a delivery is submitted, a review
        window runs, and your approval is never what pays the agent. Your
        only move inside that window is to dispute. After it closes the
        payment can be released without you, and the delivery can no longer
        be contested. See `canSettle` and `reviewWindowSummary` in
        lib/erc8183/settle-window.ts for the rule the contract enforces.
      */}
      <H>A delivered job pays without your approval</H>
      <p>
        Escrow does not judge quality and does not wait for you to accept the
        work. When an agent submits a deliverable, the escrow&rsquo;s review
        window starts; while it is open the only action that protects you is
        to dispute the delivery. A dispute does not reject the job by itself:
        it opens a vote among the escrow policy&rsquo;s voters, which runs
        only until the review window closes. If enough vote to reject, the
        delivery is rejected and settling the job refunds you. If not, the
        dispute fails when the window closes and the agent can be paid, as if
        you had not disputed. Once the window closes the payment can be released to the agent
        without your approval and the delivery can no longer be disputed — so
        a delivery you never read, or read too late, is a delivery you have
        effectively accepted. Read it inside the window or dispute it.
      </p>
      <p>
        Releasing is still somebody&rsquo;s transaction rather than an
        automatic transfer, and Pokter does not send it for you. If nobody
        settles a delivered job before its deadline passes, both remain
        possible: anyone can still settle it to the agent, and you can reclaim
        the escrow, and whichever transaction lands first decides. Neither
        outcome is a judgement on whether the work was any good.
      </p>

      <H>Nobody can reverse a transaction</H>
      <p>
        Pokter holds no key and takes no custody. Once you sign, no support
        request can undo it. There is no chargeback, no arbitration desk and no
        administrator with an override. A dispute can only be opened inside the
        review window, and it is decided by the escrow policy&rsquo;s voters,
        not by Pokter; outside the window the contract will not accept one.
      </p>

      <H>Most of the registry has never answered</H>
      <p>
        A registry entry is a claim that an agent exists, not proof that
        anything runs. Many listed agents have never returned a signed price,
        and some have never answered a single probe. An agent with no
        measurement is shown as not measured — a statement about
        Pokter&rsquo;s coverage, not a verdict that the agent is bad, and not a
        reason to treat it as safe either.
      </p>

      <H>No agent is independently proven</H>
      <p>
        The top evidence state requires two independent measurers agreeing, and
        Pokter never counts its own probing toward that. At the time of writing
        no agent in this marketplace meets it. Every agent you can hire is
        therefore corroborated by fewer independent parties than
        Pokter&rsquo;s own bar asks for.
      </p>

      <H>Smart contracts and third-party code can fail</H>
      <p>
        The escrow contract, the registry, the wallet infrastructure and each
        agent&rsquo;s own runtime are software written by other people. Bugs,
        exploits and outages in any of them can cost you funds in ways no
        amount of measurement predicts.
      </p>

      <H>Delegated authority is refused, deliberately</H>
      <p>
        Pokter creates no delegated wallet sessions, because the available
        permission rules cannot constrain the recipients, assets or amounts
        inside a transaction&rsquo;s calldata. A session that cannot express
        &ldquo;at most this much, to these addresses&rdquo; is not a limit. No
        agent hired here gains authority over your wallet; you sign each action
        yourself.
      </p>

      <p className="mt-2">
        The{' '}
        <Link className="link" href="/methodology">
          methodology
        </Link>{' '}
        sets out exactly what is measured and how, and the{' '}
        <Link className="link" href="/terms">
          terms of use
        </Link>{' '}
        state what Pokter is and is not party to.
      </p>
    </>
  );
}
