import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ResumeDraft } from '@/features/build/ResumeDraft';
import { PageHeader } from '@/features/workspace/parts';
import { Icon } from '@/ui/icons';

export const metadata: Metadata = { title: 'Create an agent', robots: { index: false } };

/*
 * Two ways to create, chosen once. The two "with an assistant" routes —
 * pasting a prompt, or connecting Pokter's MCP — are one choice with two
 * methods inside it: to a builder both mean "my assistant writes it", and
 * two cards would ask them to judge a difference they cannot see from here.
 * Importing an agent that already exists is a different person's errand,
 * so it is a pointer under the choice, not a third card beside it. Every
 * route ends in the same place: an identity on chain that Pokter checks.
 */
const PATHS = [
  {
    href: '/build/new/guided',
    icon: <Icon.Layers size={20} />,
    title: 'Guided setup',
    body: 'Fill in a short form and watch your listing take shape beside it. Pokter checks your endpoint the way a buyer’s hire would, then you register it.',
    cta: 'Start the form',
  },
  {
    href: '/build/new/assistant',
    icon: <Icon.Spark size={20} />,
    title: 'Build with your AI assistant',
    body: 'Let Claude, Cursor or Codex write it. Connect Pokter MCP so it reads Pokter’s rules as it works, or copy a build prompt into any tool.',
    cta: 'Choose a method',
  },
];

export default async function ChooseHowToCreate({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  /* A link to a particular draft or template goes straight to the form; the choice is already made. */
  const sp = await searchParams;
  if (sp.draft) redirect(`/build/new/guided?draft=${encodeURIComponent(sp.draft)}`);
  if (sp.template) redirect(`/build/new/guided?template=${encodeURIComponent(sp.template)}`);

  return (
    <>
      <PageHeader title="Choose how to create your agent" description="Two ways in. Each ends the same way: an identity on chain, checked by Pokter the way a buyer’s hire would call it." />
      <ResumeDraft />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PATHS.map((path) => (
          <li key={path.href}>
            <Link href={path.href} className="group flex h-full flex-col gap-3 rounded-[16px] border border-rule bg-raised p-6 transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift">
              <span className="grid size-10 place-items-center rounded-[10px] bg-sunken text-ink">{path.icon}</span>
              <span className="text-[17px] font-semibold tracking-[-0.01em]">{path.title}</span>
              <span className="text-[13.5px] leading-relaxed text-ink-2">{path.body}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-2 text-[13.5px] font-medium text-ink-2 group-hover:text-ink">
                {path.cta} <Icon.Arrow size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13.5px] text-ink-2">
        Already registered on ERC-8004, including through BNB Agent Studio?{' '}
        <Link href="/build/import" className="link font-medium text-ink">
          Import it by its ID instead
        </Link>
        .
      </p>
    </>
  );
}
