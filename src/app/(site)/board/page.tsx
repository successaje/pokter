import type { Metadata } from 'next';
import Link from 'next/link';

import { Doc, DocSection } from '@/features/content/Doc';
import { boardActivityNow } from '@/lib/board/activity-server';
import { BOARD_CHAIN_ID } from '@/lib/board/contract';
import { getBriefStore } from '@/lib/briefs/store';
import { ago } from '@/lib/compare/rows';
import { getJobStore } from '@/lib/erc8183/store';
import { explorerBaseFor } from '@/lib/network/presentation';
import { getQuestStore } from '@/lib/quest/store';
import { Rating } from '@/ui/Rating';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'PokterBoard',
  description: 'Reviews and requests from Agent ID holders on BNB Chain, recorded on an open contract with no owner: who has used it, and what they posted.',
};

const BOARD_SOURCE = 'https://github.com/Pokter-xyz/pokter-board';
const short = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

/* One clock for every "2 hours ago" on the page. */
function renderedAt(): number {
  return Date.now();
}

/**
 * PokterBoard's public page: what the board is, how many people holding an
 * Agent ID have used it, and everything they posted there, read from the
 * board's own events (`board/activity-server.ts`). Pokter's own wallets are
 * counted apart and marked, never as holders.
 */
export default function BoardPage() {
  const activity = boardActivityNow();
  const explorer = explorerBaseFor(BOARD_CHAIN_ID);
  const now = renderedAt();

  if (!activity) {
    return (
      <Doc label="PokterBoard" title="PokterBoard" lede="Reviews and requests from Agent ID holders, recorded on BNB Chain. The board is not open on this deployment.">
        <DocSection id="source" title="Source">
          <p>
            The contract and its review are public: <a href={BOARD_SOURCE} className="link" target="_blank" rel="noreferrer noopener">Pokter-xyz/pokter-board</a>.
          </p>
        </DocSection>
      </Doc>
    );
  }

  /* Where a post or a review leads on Pokter: the request it came from, the job it rates, the agent behind the job. */
  const requestPage = new Map(getBriefStore().all().flatMap((brief) => (brief.board ? [[brief.board.requestId, brief.id] as const] : [])));
  const jobs = getJobStore().all();
  const quest = getQuestStore();
  const agentOf = (jobId: string, provider: string) => {
    const hired = jobs.find((job) => job.chainId === BOARD_CHAIN_ID && job.jobId === jobId);
    if (hired) return { href: `/agents/${hired.agentChainId ?? BOARD_CHAIN_ID}/${hired.agentTokenId}`, name: hired.agentName };
    const agents = quest.agentsOnWallet(BOARD_CHAIN_ID, provider);
    return agents.length === 1 ? { href: `/agents/${agents[0].chainId}/${agents[0].tokenId}`, name: `Agent ${agents[0].chainId}:${agents[0].tokenId}` } : null;
  };

  /* Only what Pokter's wallets actually did: "posted 0 requests" says nothing. */
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const teamDid = [
    ...(activity.team.requests > 0 ? [`posted ${plural(activity.team.requests, 'request', 'requests')}`] : []),
    ...(activity.team.reviews > 0 ? [`recorded ${plural(activity.team.reviews, 'review', 'reviews')}`] : []),
  ];

  const counts: Array<[string, number, string]> = [
    ['Agent ID holders', activity.holders, 'Distinct wallets holding an Agent ID that posted a request or recorded a review here. Pokter’s own wallets are not counted.'],
    ['Requests posted', activity.requests, 'Work posted for agents to answer, each bound to the text its poster signed.'],
    ['Reviews recorded', activity.reviews, 'Each by the wallet that funded the job, after a delivery the agent was paid for or lost a dispute over.'],
  ];

  return (
    <Doc
      label="PokterBoard"
      title="PokterBoard"
      lede={
        <>
          Reviews and requests from Agent ID holders, recorded on BNB Chain. An Agent ID is one per Binance Wallet user and cannot be passed on, so each wallet here is one person. The
          contract checks every rule itself and has no owner: nothing on it can be changed or removed, by Pokter or anyone.
        </>
      }
    >
      <DocSection id="use" title="Who has used it">
        <dl className="grid grid-cols-1 border-y border-rule sm:grid-cols-3">
          {counts.map(([label, value, note]) => (
            <div key={label} className="flex flex-col gap-1.5 border-rule py-4 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0">
              <dt className="t-label">{label}</dt>
              <dd className="t-readout text-[30px] leading-none text-ink">{value}</dd>
              <dd className="text-[12.5px] leading-relaxed text-ink-3">{note}</dd>
            </div>
          ))}
        </dl>
        {teamDid.length > 0 && (
          <p className="text-[13px] text-ink-3">
            Pokter’s own wallets have also {teamDid.join(' and ')} as tests. They are marked below and left out of the counts and of every agent’s rating.
          </p>
        )}
        <p className="text-[13px] text-ink-3">
          Read from the board’s own events about every ten minutes{activity.scannedAt ? <>, last read {ago(activity.scannedAt, now)}</> : '; the first read runs with the next sweep'}. Anyone can check them on{' '}
          <a href={`${explorer}/address/${activity.board}#events`} className="link" target="_blank" rel="noreferrer noopener">
            BscScan
          </a>
          .
        </p>
      </DocSection>

      <DocSection id="activity" title="On the board">
        {activity.latest.length === 0 ? (
          <p>
            Nothing yet. A request posted or a review recorded here appears within about ten minutes of its transaction. To use it, hold an Agent ID in the wallet you use on Pokter:{' '}
            <Link href="/requests" className="link">
              post a request
            </Link>{' '}
            and choose &ldquo;Post it on PokterBoard too&rdquo;, or review a job you funded from your workspace.
          </p>
        ) : (
          <ol className="ruled border-y border-rule">
            {activity.latest.slice(0, 50).map((event) => {
              const agent = event.kind === 'review' && event.jobId && event.provider ? agentOf(event.jobId, event.provider) : null;
              const pokterRequest = event.requestId ? requestPage.get(event.requestId) : undefined;
              return (
                <li key={`${event.tx}:${event.logIndex}`} className="flex flex-col gap-1.5 py-4 text-[14px]">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {event.kind === 'review' ? (
                      <>
                        <span className="font-medium text-ink">Review of job #{event.jobId}</span>
                        {event.rating ? <Rating value={event.rating} /> : null}
                      </>
                    ) : (
                      <span className="font-medium text-ink">
                        {event.kind === 'request' ? 'Request' : 'Closed request'} #{event.requestId}
                      </span>
                    )}
                    {event.team && <span className="text-[12px] font-medium text-ink-2">Pokter team</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 text-[12.5px] text-ink-3">
                    {event.wallet && <span className="t-readout">{short(event.wallet)}</span>}
                    {event.time && <span>{ago(event.time, now)}</span>}
                    {agent && (
                      <Link href={agent.href} className="link">
                        {agent.name}
                      </Link>
                    )}
                    {event.kind === 'review' && event.jobId && (
                      <Link href={`/jobs/${BOARD_CHAIN_ID}/${event.jobId}`} className="link">
                        The job
                      </Link>
                    )}
                    {pokterRequest && (
                      <Link href={`/requests/${pokterRequest}`} className="link">
                        The request on Pokter
                      </Link>
                    )}
                    <a href={`${explorer}/tx/${event.tx}`} className="link" target="_blank" rel="noreferrer noopener">
                      Transaction
                    </a>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </DocSection>

      <DocSection id="rules" title="What the board accepts">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>A review</strong> comes only from the wallet that funded an ERC-8183 escrow job, once per job, after the agent delivered, and only when the job was settled to the
            agent or rejected under the escrow&rsquo;s dispute policy. A job its funder took back without a verdict cannot be reviewed.
          </li>
          <li>
            <strong>Each person counts once per agent wallet:</strong> their latest review is their rating, and hiring the same agent again replaces it rather than adding a vote.
          </li>
          <li>
            <strong>A request</strong> binds a hash of the text its poster signed on Pokter. The text stays on Pokter, and anyone can hash it again and compare.
          </li>
          <li>
            <strong>Both</strong> need the sending wallet to hold an Agent ID, checked by the contract against the Agent ID registry when it is sent.
          </li>
        </ul>
      </DocSection>

      <DocSection id="contract" title="The contract">
        <p>
          <a href={`${explorer}/address/${activity.board}#code`} className="link t-readout wrap-anywhere" target="_blank" rel="noreferrer noopener">
            {activity.board}
          </a>{' '}
          on BNB Smart Chain{activity.fromBlock !== null ? `, deployed in block ${activity.fromBlock}` : ''}, with its source verified. No owner, no admin, no upgrade; it holds no
          funds and moves no tokens. It relies on BNB&rsquo;s escrow and the Agent ID registry, whose owners it cannot overrule: the{' '}
          <a href={`${BOARD_SOURCE}#what-it-trusts`} className="link" target="_blank" rel="noreferrer noopener">
            README says what that means
          </a>
          , and its{' '}
          <a href={`${BOARD_SOURCE}/blob/main/REVIEW.md`} className="link" target="_blank" rel="noreferrer noopener">
            pre-deployment review
          </a>{' '}
          lists every finding and what was done about it.
        </p>
      </DocSection>
    </Doc>
  );
}
