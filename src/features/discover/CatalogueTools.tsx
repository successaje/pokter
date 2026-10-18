import Link from 'next/link';

import { Icon } from '@/ui/icons';

/**
 * The two things you can do with the catalogue as a whole, rather than with
 * one agent in it.
 *
 * They were links beside the page title, then under sort, and in both
 * places they competed with the search for attention while being the last
 * thing a visitor needs. At the bottom they are where somebody who has read
 * the whole list ends up, which is the only point at which "check all of
 * this yourself" is a reasonable thing to suggest.
 *
 * Shared by Discover and the full listing. Both end the same way and the
 * descriptions here are specific enough to go stale if they are copied.
 */
const TOOLS = [
  {
    href: '/api/v1/agents/verifier',
    download: true,
    title: 'Verify the catalogue yourself',
    body: 'One Node file, no dependencies. It reads every page of the public discovery API and checks each identity and owner against its ERC-8004 registry. No wallet is opened and nothing is broadcast.',
  },
  {
    href: '/rankings',
    download: false,
    title: 'Outcome rankings',
    body: 'Categories ranked on settled escrow work, buyer diversity, completion outcomes and disclosed task tests — not on listings or on anything an operator claims.',
  },
];

export function CatalogueTools() {
  return (
    <section aria-labelledby="tools-title" className="mt-6 border-t border-rule pt-8">
      <h2 id="tools-title" className="t-label mb-4">Check the catalogue</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TOOLS.map((tool) => {
          const inner = (
            <>
              <span className="flex items-center gap-1.5 text-[14px] font-medium">
                {tool.title}
                <Icon.Arrow size={14} className="text-ink-3 transition-colors group-hover:text-ink" />
              </span>
              <span className="text-[12.5px] leading-relaxed text-ink-3">{tool.body}</span>
            </>
          );
          const className = 'group flex h-full flex-col gap-1.5 rounded-[12px] border border-rule bg-raised p-4 transition-colors hover:border-rule-strong';
          return (
            <li key={tool.href} className="flex min-w-0">
              {tool.download ? (
                /* A download, not a page: `Link` would prefetch a file. */
                <a href={tool.href} download className={className}>
                  {inner}
                </a>
              ) : (
                <Link href={tool.href} className={className}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
