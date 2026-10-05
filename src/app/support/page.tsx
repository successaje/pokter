import type { Metadata } from 'next';
import Link from 'next/link';

import { NETWORK_LABEL } from '@/lib/network/presentation';
import {
  GITHUB_ISSUE_URL,
  GITHUB_REPO_URL,
  SECURITY_EMAIL,
  SUPPORT_EMAIL,
} from '@/lib/support/contact';

export const metadata: Metadata = {
  // The root layout appends "· Pokter", so naming it here would say it twice.
  title: 'Support',
  description:
    'How to reach Pokter, what we can help with, and what escrow settles without us.',
};

/**
 * §61. Where to get help, and the limits of the help available.
 *
 * The page leads with what Pokter cannot do rather than burying it. A
 * marketplace that moves money through escrow attracts one question above all
 * others — "can you get my money back" — and the answer is no, because Pokter
 * holds no key that could. Saying so first is kinder than saying it in reply
 * to an email two days later, and a support page that implies custody would
 * claim a power this product has spent its whole design avoiding.
 */

function Card({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="surface-card flex scroll-mt-24 flex-col gap-2 p-5">
      <h3 className="font-[family-name:var(--font-serif)] text-lg">{title}</h3>
      <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
        {children}
      </div>
    </div>
  );
}

const linkClass =
  'text-[color:var(--info)] underline decoration-dotted underline-offset-2 hover:decoration-solid';

export default function SupportPage() {
  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Support
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Pokter is small and answers its own mail. Ask about anything here —
          a number that looks wrong, an agent listed badly, a hire that did not
          behave. What follows is what we can actually do about each, which is
          not the same as what a marketplace is usually assumed to be able to
          do.
        </p>
      </header>

      {/*
        First, not last. Everything else on the page is easier to read once
        this is settled.
      */}
      <section className="flex max-w-3xl flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-serif)] text-lg">
          What Pokter cannot do
        </h2>
        <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          <span className="font-medium text-[color:var(--text)]">
            We cannot move, release, freeze or refund your money.
          </span>{' '}
          Hiring funds an ERC-8183 escrow contract directly from your own
          wallet on {NETWORK_LABEL}, and the contract releases it by its own
          rules. Pokter holds no key that could override that, which is the
          point — it is also why nobody who compromises Pokter can take your
          funds.
        </p>
        <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          If a job has not been delivered, the escrow has its own answers:
          contest the delivery to open a dispute, or reclaim the budget once
          the job expires. Both are on-chain actions you take from{' '}
          <Link href="/activity" className={linkClass}>
            your activity
          </Link>
          , with your own wallet. We can help you read what the chain says
          happened and tell you which option applies — we cannot take either
          action for you.
        </p>
      </section>

      <section id="where-to-send-what" className="flex scroll-mt-24 flex-col gap-4">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          Where to send what
        </h2>

        <div className="grid gap-3 md:grid-cols-3">
          <Card title="A number looks wrong">
            <p>
              A score, an uptime figure, an attestation count, a price that
              does not match its source. This is the most serious kind of bug
              Pokter can have, and it belongs in public so the correction is on
              the record too.
            </p>
            <p>
              <a
                href={`${GITHUB_ISSUE_URL}?template=evidence-looks-wrong.yml`}
                target="_blank"
                rel="noreferrer noopener"
                className={linkClass}
              >
                Open an issue ↗
              </a>
            </p>
          </Card>

          <Card title="Something is broken">
            <p>
              A page, a control, or a hire that will not progress. If money is
              sitting in escrow, say so at the top — those come first.
            </p>
            <p>
              <a
                href={`${GITHUB_ISSUE_URL}?template=bug.yml`}
                target="_blank"
                rel="noreferrer noopener"
                className={linkClass}
              >
                Open an issue ↗
              </a>{' '}
              or email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                {SUPPORT_EMAIL}
              </a>
            </p>
          </Card>

          <Card id="security" title="A security problem">
            <p>
              Anything that could move funds, forge evidence, or make Pokter
              act on text a third party published. Please do not open a public
              issue for these.
            </p>
            <p>
              <a href={`mailto:${SECURITY_EMAIL}`} className={linkClass}>
                {SECURITY_EMAIL}
              </a>{' '}
              — see{' '}
              <a
                href={`${GITHUB_REPO_URL}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noreferrer noopener"
                className={linkClass}
              >
                SECURITY.md ↗
              </a>
            </p>
          </Card>
        </div>

        <p className="max-w-3xl text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          Publish an agent and want to know why it looks the way it does? The{' '}
          <Link href="/build" className={linkClass}>
            agent diagnostic
          </Link>{' '}
          runs the marketplace&apos;s own checks against it and reports what
          they found. Anything else — a question about how something is
          measured, or a thing that does not fit the boxes above — goes to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
            {SUPPORT_EMAIL}
          </a>
          . We answer within a few days, and we answer even when the answer is
          that we cannot help.
        </p>
      </section>

      <section className="flex max-w-3xl flex-col gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          Before you write
        </h2>
        <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          Two questions come up often enough to answer here.{' '}
          <Link href="/methodology" className={linkClass}>
            Methodology
          </Link>{' '}
          states every threshold Pokter enforces, imported from the code that
          enforces it, so a disagreement about a verdict can be settled against
          the rule rather than against us.
        </p>
        <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          And Pokter does not measure returns, drawdown or profitability, for
          any agent, ever. Nobody publishes that data, and inferring it from
          uptime would be a fabrication. If you are asking whether an agent
          will make money, we genuinely do not know and will say so.
        </p>
      </section>
    </div>
  );
}
