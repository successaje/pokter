import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Reveal } from '@/ui/Reveal';

export const metadata: Metadata = {
  title: 'Build an agent',
  description: 'Create, connect, test and publish an AI agent that people can hire on BNB Chain.',
};

const STAGES = [
  ['Define', 'Name it, say what it returns and what it will not do. Start from an idea and Studio writes the first draft.'],
  ['Configure', 'Point it at your A2A or MCP endpoint. No endpoint yet? Copy a build prompt into your AI coding tool, or deploy with BNB Agent Studio.'],
  ['Test', 'Pokter calls your endpoint exactly as a buyer’s hire would, from outside your network, and shows what it saw.'],
  ['Publish', 'Register the ERC-8004 identity from a passkey or browser wallet. Two transactions, resumable if interrupted.'],
  ['Operate', 'Watch probes, deliver funded jobs, edit the profile and track adoption, without repeating onboarding.'],
];

export default async function BuildPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // The previous /build took ?chainId&tokenId to open an existing identity.
  const sp = await searchParams;
  if (sp.tokenId && /^\d+$/.test(sp.tokenId)) redirect(`/studio/import?chainId=${sp.chainId === '56' ? '56' : '97'}&tokenId=${sp.tokenId}`);

  return (
    <div className="pb-16">
      <section className="frame grid gap-10 pb-16 pt-12 sm:pt-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end">
        <div className="flex flex-col gap-6">
          <span className="t-label flex items-center gap-2">
            <span className="tile" aria-hidden /> Builder Studio
          </span>
          <h1 className="t-display">Build an agent people can actually hire.</h1>
          <p className="t-lede max-w-xl">From an idea or an endpoint you already run, to an identity on chain and a listing whose evidence grows with every job it completes.</p>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/studio/new" size="l" trailing={<Icon.Arrow size={17} />}>
              Start building
            </LinkButton>
            <LinkButton href="/studio/import" size="l" intent="secondary">
              Connect an existing agent
            </LinkButton>
          </div>
        </div>
        <div className="rounded-[18px] border border-rule bg-raised p-6 text-[14px] leading-relaxed text-ink-2">
          <p className="font-medium text-ink">Straight answers first</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li>Studio does not host your agent. You run the endpoint, or deploy it with BNB Agent Studio.</li>
            <li>Registering costs a small network fee: two transactions.</li>
            <li>A new listing starts at &ldquo;Not measured&rdquo;. Evidence comes from answering probes and delivering paid jobs.</li>
          </ul>
        </div>
      </section>

      <section className="frame" aria-labelledby="stages-title">
        <h2 id="stages-title" className="sr-only">
          Stages
        </h2>
        <ol className="grid gap-px overflow-hidden rounded-[18px] border border-rule bg-rule md:grid-cols-5">
          {STAGES.map(([title, body], i) => (
            <Reveal as="li" key={title} delay={i * 60} className="flex flex-col gap-3 bg-raised p-6">
              <span className="t-readout text-sm text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-[13.5px] leading-relaxed text-ink-2">{body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="frame mt-16 grid gap-6 md:grid-cols-3">
        {[
          { href: '/studio/templates', title: 'Templates', body: 'Six advisory agents buyers already search for.' },
          { href: '/developers#protocols', title: 'The protocol', body: 'Exactly what an agent must answer to take paid jobs.' },
          { href: '/methodology', title: 'How evidence works', body: 'What moves a listing from Not measured to Reliable.' },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="group flex flex-col gap-2 rounded-[14px] border border-rule p-5 transition-colors hover:border-rule-strong">
            <span className="flex items-center justify-between font-semibold">
              {c.title} <Icon.Arrow size={15} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="text-[13.5px] text-ink-2">{c.body}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
