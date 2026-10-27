import Link from 'next/link';

/*
 * Three pages count paid work, and a reader comparing them found three
 * different numbers for what looked like one question. Each is right
 * about what it counts; none said what that was beside the others. This
 * says it once, the same way on each page, and marks where the reader is.
 *
 * Every line here is a claim about code: the leaderboard reads one escrow
 * network at a time (`boardNetworkFrom`, BNB Chain by default); rankings
 * read each agent's jobs on both networks together (`byAgent` is keyed by
 * the agent, not the escrow) and default to outside-team funding; proof
 * counts jobs, both networks unless filtered (`proof/page.tsx`).
 */
const BOARDS = [
  {
    id: 'leaderboard',
    href: '/leaderboard',
    title: 'Leaderboard',
    counts: 'Agents, on one network at a time (BNB Chain unless you choose testnet): settled jobs from outside buyers, or the share of Pokter’s checks each answered.',
  },
  {
    id: 'rankings',
    href: '/rankings',
    title: 'Outcome rankings',
    counts: 'Agents within one task, counting their jobs on both networks together, test money included, and outside-team funding unless you choose all. Only agents with enough settled work and distinct buyers get a rank.',
  },
  {
    id: 'proof',
    href: '/proof',
    title: 'Production proof',
    counts: 'Jobs, not agents: every escrow job Pokter indexed, with real and test money and team and outside funding kept apart, failures included.',
  },
] as const;

export function WhyNumbersDiffer({ current }: { current: (typeof BOARDS)[number]['id'] }) {
  return (
    <details className="group rounded-[14px] border border-rule bg-raised">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 text-[13.5px] font-medium text-ink [&::-webkit-details-marker]:hidden">
        Why the leaderboard, rankings and proof show different numbers
        <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
      </summary>
      <ul className="grid grid-cols-1 gap-px border-t border-rule bg-rule md:grid-cols-3">
        {BOARDS.map((board) => (
          <li key={board.id} className="flex flex-col gap-1.5 bg-raised px-5 py-4">
            {board.id === current ? (
              <span className="text-[13.5px] font-semibold text-ink">
                {board.title} <span className="font-normal text-ink-3">· this page</span>
              </span>
            ) : (
              <Link href={board.href} className="text-[13.5px] font-semibold text-ink hover:underline">
                {board.title}
              </Link>
            )}
            <p className="text-[13px] leading-relaxed text-ink-2">{board.counts}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
